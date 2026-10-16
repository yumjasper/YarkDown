/* global Game, Render, SPRITES, BACKGROUND, resetCars, keyLeft: writable, keyRight: writable, keyFaster: writable, keySlower: writable, position: writable, speed: writable, currentLapTime: writable, playerX: writable */
/* eslint no-unused-vars: ["error", { "vars": "local" }] -- Shared classic-script state is read by the upstream engine. */
export function installRacer () {
  let paused = false
  const run = Game.run
  Game.run = (options) =>
    run({
      ...options,
      update: (dt) => {
        if (!paused) options.update(dt)
      }
    })
  Game.loadImages = (_names, ready) => {
    const atlas = document.createElement('canvas')
    atlas.width = atlas.height = 1536
    const ctx = atlas.getContext('2d')
    for (const [name, rect] of Object.entries(SPRITES)) {
      if (!rect || typeof rect.x !== 'number') continue
      const { x, y, w, h } = rect
      ctx.save()
      ctx.translate(x, y)
      if (/PLAYER|CAR|TRUCK|SEMI/.test(name)) {
        ctx.fillStyle = '#172132'
        ctx.fillRect(0, h * 0.45, w, h * 0.5)
        ctx.fillStyle = name.includes('PLAYER')
          ? '#ed6755'
          : ['#e6ba56', '#6099d6', '#b794d8'][name.length % 3]
        ctx.beginPath()
        ctx.moveTo(w * 0.08, h * 0.92)
        ctx.lineTo(w * 0.18, h * 0.12)
        ctx.lineTo(w * 0.82, h * 0.12)
        ctx.lineTo(w * 0.92, h * 0.92)
        ctx.fill()
        ctx.fillStyle = '#b8e6ee'
        ctx.fillRect(w * 0.26, h * 0.22, w * 0.48, h * 0.25)
        ctx.fillStyle = '#fff2c6'
        ctx.fillRect(w * 0.15, h * 0.75, w * 0.16, h * 0.1)
        ctx.fillRect(w * 0.69, h * 0.75, w * 0.16, h * 0.1)
      } else if (name.includes('BILLBOARD')) {
        ctx.fillStyle = '#66544c'
        ctx.fillRect(w * 0.45, 0, w * 0.1, h)
        ctx.fillStyle = '#ffde9e'
        ctx.fillRect(0, 0, w, h * 0.72)
        ctx.fillStyle = '#355469'
        ctx.font = `bold ${Math.floor(w * 0.18)}px sans-serif`
        ctx.textAlign = 'center'
        ctx.fillText('弯道慢行', w / 2, h * 0.43)
      } else {
        ctx.fillStyle = '#795c49'
        ctx.fillRect(w * 0.44, h * 0.4, w * 0.12, h * 0.6)
        ctx.fillStyle = '#378c76'
        ctx.beginPath()
        ctx.moveTo(w / 2, 0)
        ctx.lineTo(w, h * 0.8)
        ctx.lineTo(0, h * 0.8)
        ctx.fill()
      }
      ctx.restore()
    }
    ready([null, atlas])
  }
  Render.background = (ctx, _image, width, height, layer) => {
    if (layer !== BACKGROUND.SKY) return
    const gradient = ctx.createLinearGradient(0, 0, 0, height)
    gradient.addColorStop(0, '#8acde4')
    gradient.addColorStop(0.6, '#e4f3e5')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = '#fff0bf'
    ctx.beginPath()
    ctx.arc(width * 0.8, height * 0.18, height * 0.055, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#80b5a1'
    ctx.beginPath()
    ctx.moveTo(0, height * 0.58)
    for (let i = 0; i <= 12; i++) ctx.lineTo((width * i) / 12, height * (0.32 + (i % 3) * 0.08))
    ctx.lineTo(width, height)
    ctx.lineTo(0, height)
    ctx.fill()
  }
  const clearKeys = () => {
    keyLeft = keyRight = keyFaster = keySlower = false
  }
  const toggle = () => {
    paused = !paused
    clearKeys()
    document.getElementById('pause').textContent = paused ? '继续驾驶' : '暂停'
  }
  document.getElementById('pause').onclick = toggle
  document.getElementById('restart').onclick = () => {
    position = speed = currentLapTime = 0
    playerX = 0
    resetCars()
    clearKeys()
    if (paused) toggle()
  }
  document.addEventListener('keydown', (event) => {
    if (event.code === 'KeyP' && !event.repeat) toggle()
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) { event.preventDefault() }
  })
  window.addEventListener('blur', () => {
    if (!paused) toggle()
  })
  for (const button of document.querySelectorAll('[data-drive]')) {
    const key = button.dataset.drive
    const set = (down) => {
      if (key === 'left') keyLeft = down
      if (key === 'right') keyRight = down
      if (key === 'up') keyFaster = down
      if (key === 'down') keySlower = down
    }
    button.onpointerdown = (event) => {
      button.setPointerCapture(event.pointerId)
      set(true)
    }
    button.onpointerup = button.onpointercancel = button.onlostpointercapture = () => set(false)
  }
}
