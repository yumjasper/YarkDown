import * as pdfjs from 'pdfjs-dist'
import type { PDFPageProxy } from 'pdfjs-dist'

/**
 * Images smaller than this (in PDF points) are ruled lines, bullets and logo
 * glyphs; hit-testing them would steal double-clicks meant for text.
 */
export const PDF_IMAGE_MIN_POINTS = 12

/** The probe only needs the transform chain, so its canvas stays tiny. */
const PROBE_SCALE = 0.25
const DISPLAY_RENDER_WIDTH = 2048
const EXPORT_RENDER_WIDTH = 4096
const MAX_RENDER_PIXELS = 6 * 1024 * 1024
const MAX_RENDER_DIMENSION = 4096
const MAX_UPSCALE = 40

export interface PdfImageQuad {
  /** Display-orientation page corners, normalized to the page viewport. */
  quad: [number, number][]
  /** Normalized area, used to prefer the innermost image when several overlap. */
  area: number
  /** Displayed size in PDF points. */
  width: number
  height: number
}

const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx
const normalizeRotation = (rotation: number) => (((Math.round(rotation / 90) * 90) % 360) + 360) % 360

// pdf.js records image coordinates once per page and then keeps them on the
// page proxy forever, so the probe orientation must stay stable; viewer rotation
// is applied afterwards by `toDisplayCoordinates`.
const probeCache = new WeakMap<PDFPageProxy, Promise<Float32Array>>()

/**
 * Renders the page into a throwaway canvas with `recordImages` so pdf.js itself
 * reports where each image landed, including clip paths, form XObjects and
 * nested transforms that a hand-rolled operator walk would get wrong.
 *
 * The coordinates come back normalized against the probe canvas and expressed in
 * the page's own `/Rotate` orientation.
 */
export const probePageImages = (page: PDFPageProxy): Promise<Float32Array> => {
  const cached = probeCache.get(page)
  if (cached) return cached
  const probe = (async() => {
    const rotation = normalizeRotation(page.rotate)
    const viewport = page.getViewport({ scale: PROBE_SCALE, rotation })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.ceil(viewport.width))
    canvas.height = Math.max(1, Math.ceil(viewport.height))
    try {
      await page.render({
        canvas,
        viewport,
        recordImages: true,
        // Matching the viewer's annotation mode reuses its cached operator list.
        annotationMode: pdfjs.AnnotationMode.ENABLE_STORAGE,
        background: '#ffffff'
      }).promise
    } catch (error) {
      // A page torn down mid-probe has no images to offer; callers just miss.
      probeCache.delete(page)
      if ((error as Error | undefined)?.name === 'RenderingCancelledException') return new Float32Array()
      throw error
    }
    const recorded = page.imageCoordinates as ArrayLike<number> | null
    if (!recorded) return new Float32Array()
    const coordinates = Float32Array.from(recorded)
    // The probe canvas is ceil'd to whole pixels, so rescale the ratios onto the
    // exact viewport size; otherwise hit-testing drifts by up to one pixel.
    const scaleX = canvas.width / viewport.width
    const scaleY = canvas.height / viewport.height
    if (scaleX !== 1 || scaleY !== 1) {
      for (let index = 0; index + 1 < coordinates.length; index += 2) {
        coordinates[index] *= scaleX
        coordinates[index + 1] *= scaleY
      }
    }
    return coordinates
  })()
  probeCache.set(page, probe)
  return probe
}

/**
 * Maps normalized coordinates from the probe orientation (the page's own
 * `/Rotate`) into the orientation on screen, which is what pdf.js does when it
 * adds `pagesRotation` to `/Rotate`.
 *
 * The mapping goes through real PDF space using both viewports instead of a
 * hand-written rotation matrix, so non-zero `MediaBox` origins and `UserUnit`
 * scale factors stay correct.
 */
export const toDisplayCoordinates = (
  page: PDFPageProxy,
  coordinates: Float32Array,
  extraRotation: number
): Float32Array => {
  const probeRotation = normalizeRotation(page.rotate)
  const displayRotation = normalizeRotation(page.rotate + extraRotation)
  if (displayRotation === probeRotation) return coordinates
  const probe = page.getViewport({ scale: PROBE_SCALE, rotation: probeRotation })
  const display = page.getViewport({ scale: 1, rotation: displayRotation })
  const mapped = new Float32Array(coordinates.length)
  for (let index = 0; index + 1 < coordinates.length; index += 2) {
    const [pdfX, pdfY] = probe.convertToPdfPoint(
      coordinates[index] * probe.width,
      coordinates[index + 1] * probe.height
    )
    const [viewX, viewY] = display.convertToViewportPoint(pdfX, pdfY)
    mapped[index] = viewX / display.width
    mapped[index + 1] = viewY / display.height
  }
  return mapped
}

/**
 * Finds the smallest recorded image containing the normalized point.
 *
 * Each record holds three image-space corners normalized to the probe canvas:
 * (0,-h), (0,0) and (w,-h). Canvas y grows downward while PDF y grows upward,
 * so these land flipped on screen; only `width`/`height` and the contained-area
 * test depend on them, and neither cares about orientation.
 */
export const hitTestPageImage = (
  coordinates: Float32Array,
  normalizedX: number,
  normalizedY: number,
  widthPoints: number,
  heightPoints: number,
  minPoints = PDF_IMAGE_MIN_POINTS
): PdfImageQuad | null => {
  let best: PdfImageQuad | null = null
  for (let index = 0; index + 5 < coordinates.length; index += 6) {
    const bottomLeft: [number, number] = [coordinates[index], coordinates[index + 1]]
    const topLeft: [number, number] = [coordinates[index + 2], coordinates[index + 3]]
    const bottomRight: [number, number] = [coordinates[index + 4], coordinates[index + 5]]
    // bottomRight = topLeft + right + down, so subtracting bottomLeft isolates
    // the horizontal axis instead of the diagonal.
    const down = [bottomLeft[0] - topLeft[0], bottomLeft[1] - topLeft[1]]
    const right = [bottomRight[0] - bottomLeft[0], bottomRight[1] - bottomLeft[1]]
    // An image drawn through a clip path can report a degenerate triangle.
    const determinant = cross(down[0], down[1], right[0], right[1])
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-9) continue
    const dx = normalizedX - topLeft[0]
    const dy = normalizedY - topLeft[1]
    // Test the point in the image's own axes rather than the page's.
    const along = cross(dx, dy, right[0], right[1]) / determinant
    const across = cross(down[0], down[1], dx, dy) / determinant
    if (along < 0 || along > 1 || across < 0 || across > 1) continue
    const width = Math.hypot(right[0], right[1]) * widthPoints
    const height = Math.hypot(down[0], down[1]) * heightPoints
    if (width < minPoints || height < minPoints) continue
    const area = Math.abs(determinant)
    if (best && best.area <= area) continue
    best = {
      quad: [
        topLeft,
        [topLeft[0] + right[0], topLeft[1] + right[1]],
        [topLeft[0] + right[0] + down[0], topLeft[1] + right[1] + down[1]],
        [topLeft[0] + down[0], topLeft[1] + down[1]]
      ],
      area,
      width,
      height
    }
  }
  return best
}

/**
 * Renders only the image region, so the result stays sharp at high zoom without
 * spending the 8M-pixel budget that whole-page canvases are capped at.
 */
export const renderPageImageRegion = async(
  page: PDFPageProxy,
  quad: [number, number][],
  extraRotation = 0,
  widthPixels = DISPLAY_RENDER_WIDTH
): Promise<HTMLCanvasElement> => {
  const rotation = normalizeRotation(page.rotate + extraRotation)
  const unit = page.getViewport({ scale: 1, rotation })
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of quad) {
    minX = Math.min(minX, x * unit.width)
    maxX = Math.max(maxX, x * unit.width)
    minY = Math.min(minY, y * unit.height)
    maxY = Math.max(maxY, y * unit.height)
  }
  // A clipped image reports corners outside the page; keep the canvas in bounds.
  minX = Math.max(0, minX)
  minY = Math.max(0, minY)
  maxX = Math.min(unit.width, maxX)
  maxY = Math.min(unit.height, maxY)
  const boxWidth = Math.max(1, maxX - minX)
  const boxHeight = Math.max(1, maxY - minY)
  const scale = Math.max(
    0.01,
    Math.min(
      MAX_UPSCALE,
      Math.max(1, widthPixels / boxWidth),
      MAX_RENDER_DIMENSION / boxWidth,
      MAX_RENDER_DIMENSION / boxHeight,
      Math.sqrt(MAX_RENDER_PIXELS / (boxWidth * boxHeight))
    )
  )
  const viewport = page.getViewport({ scale, rotation })
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(boxWidth * scale))
  canvas.height = Math.max(1, Math.round(boxHeight * scale))
  // pdf.js applies `transform` first and concatenates the viewport matrix after
  // it, so the translation acts on already-scaled canvas coordinates; rotation
  // is baked into the viewport matrix. Verified against a real render: a region
  // straddling an image edge lands within one pixel of its true position.
  await page.render({
    canvas,
    viewport,
    transform: [1, 0, 0, 1, -minX * scale, -minY * scale],
    annotationMode: pdfjs.AnnotationMode.ENABLE_STORAGE,
    background: '#ffffff'
  }).promise
  return canvas
}

/** Same as the display render but aims at print-grade resolution. */
export const renderPageImageForExport = (
  page: PDFPageProxy,
  quad: [number, number][],
  extraRotation = 0
): Promise<HTMLCanvasElement> =>
  renderPageImageRegion(page, quad, extraRotation, EXPORT_RENDER_WIDTH)

export const canvasToPngBytes = (canvas: HTMLCanvasElement): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(async(blob) => {
      if (!blob) {
        reject(new Error('Could not encode the image as PNG.'))
        return
      }
      resolve(new Uint8Array(await blob.arrayBuffer()))
    }, 'image/png')
  })
