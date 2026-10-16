/* global addScore: writable, update: writable, play: writable, lose: writable, keydown: writable, score, playing, clearActions, move, DIR, drop */
export function installTetris () {
  let paused = false
  let best = Math.max(0, Number(localStorage.getItem('best')) || 0)
  const label = document.getElementById('best')
  label.textContent = best
  const originalScore = addScore
  addScore = (value) => {
    originalScore(value)
    if (score > best) {
      best = score
      label.textContent = best
      localStorage.setItem('best', best)
    }
  }
  const originalUpdate = update
  update = (dt) => {
    if (!paused) originalUpdate(dt)
  }
  const toggle = () => {
    if (!playing) return
    paused = !paused
    clearActions()
    document.getElementById('pause').textContent = paused ? '继续游戏' : '暂停'
    document.getElementById('status').textContent = paused ? '已暂停' : '方向键移动、旋转与加速下落'
  }
  const originalPlay = play
  play = () => {
    paused = false
    originalPlay()
    document.getElementById('pause').textContent = '暂停'
    document.getElementById('status').textContent = '方向键移动、旋转与加速下落'
  }
  const originalLose = lose
  lose = () => {
    originalLose()
    document.getElementById('status').textContent = '游戏结束，点击开始再挑战一次'
  }
  const originalKeydown = keydown
  keydown = (event) => {
    if (event.code === 'KeyP') {
      event.preventDefault()
      if (!event.repeat) toggle()
    } else if (paused) event.preventDefault()
    else if (playing && event.code === 'Space') {
      event.preventDefault()
      if (!event.repeat) {
        clearActions()
        // Lock only after reaching the last free row; moving alone does not score.
        while (move(DIR.DOWN)) { continue }
        drop()
      }
    } else originalKeydown(event)
  }
  // The upstream listener retains the original callback until it is explicitly replaced.
  document.removeEventListener('keydown', originalKeydown)
  document.addEventListener('keydown', keydown)
  document.getElementById('start').onclick = () => play()
  document.getElementById('restart').onclick = () => play()
  document.getElementById('pause').onclick = toggle
  window.addEventListener('blur', () => {
    if (playing && !paused) toggle()
  })
  for (const button of document.querySelectorAll('[data-key]')) {
    button.onclick = () =>
      keydown({
        keyCode: Number(button.dataset.key),
        code: button.dataset.key === '32' ? 'Space' : '',
        preventDefault () {}
      })
  }
}
