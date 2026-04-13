import { Notyf } from 'notyf'

export const notyf = new Notyf({
  duration: 3200,
  ripple: true,
  dismissible: true,
  position: { x: 'right', y: 'top' },
})
