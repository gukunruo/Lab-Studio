import type { Directive, DirectiveBinding } from 'vue'

const io =
  typeof IntersectionObserver !== 'undefined'
    ? new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              entry.target.classList.add('is-revealed')
              io?.unobserve(entry.target)
            }
          }
        },
        { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
      )
    : null

export const vReveal: Directive<HTMLElement> = {
  mounted(el: HTMLElement, binding: DirectiveBinding) {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce || !io) {
      el.classList.add('is-revealed')
      return
    }
    el.classList.add('reveal')
    if (typeof binding.value === 'number') {
      el.style.transitionDelay = `${binding.value}ms`
    }
    io.observe(el)
  },
  unmounted(el: HTMLElement) {
    io?.unobserve(el)
  },
}
