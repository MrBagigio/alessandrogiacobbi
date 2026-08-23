/**
 * anchors.test.js — in-page anchor links: focus moves to the target, hash is
 * pushed, reduced motion disables smooth scrolling, the skip-link is NOT
 * intercepted (native fragment navigation is what makes it work for
 * keyboard / AT users).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { initAnchorLinks } from '../assets/js/anchors.js'

function mount() {
  document.body.innerHTML = `
    <a href="#main" class="skip-link">Salta al contenuto</a>
    <header><a id="about-link" href="#about">About</a><a id="bare" href="#">top</a><a id="missing" href="#nope">x</a></header>
    <main id="main"><section id="about">About</section></main>`
  return {
    skip: document.querySelector('.skip-link'),
    about: document.getElementById('about-link'),
    bare: document.getElementById('bare'),
    missing: document.getElementById('missing'),
    main: document.getElementById('main'),
    aboutSec: document.getElementById('about'),
  }
}

describe('initAnchorLinks', () => {
  let scrollSpy, pushSpy
  beforeEach(() => {
    history.replaceState(null, '', location.pathname)   // jsdom keeps the hash across tests
    scrollSpy = vi.fn()
    Element.prototype.scrollIntoView = scrollSpy
    pushSpy = vi.spyOn(history, 'pushState')
  })
  afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks() })

  it('About: prevents default, smooth-scrolls, moves focus (tabindex=-1) and pushes the hash', () => {
    const { about, aboutSec } = mount()
    initAnchorLinks(document, { reduced: false })
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true })
    about.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
    expect(scrollSpy).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth', block: 'start' }))
    expect(aboutSec.getAttribute('tabindex')).toBe('-1')
    expect(document.activeElement).toBe(aboutSec)
    expect(pushSpy).toHaveBeenCalledWith(null, '', '#about')
  })

  it('reduced motion → behavior "auto" (no animated page scroll)', () => {
    const { about } = mount()
    initAnchorLinks(document, { reduced: true })
    about.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(scrollSpy).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }))
  })

  it('the skip-link is left native: not intercepted, no scrollIntoView, focus not hijacked', () => {
    const { skip } = mount()
    initAnchorLinks(document)
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true })
    skip.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(false)
    expect(scrollSpy).not.toHaveBeenCalled()
    expect(pushSpy).not.toHaveBeenCalled()
  })

  it('bare "#" and missing targets stay native; clicking twice does not push a duplicate hash', () => {
    const { bare, missing, about } = mount()
    initAnchorLinks(document)
    const e1 = new MouseEvent('click', { bubbles: true, cancelable: true }); bare.dispatchEvent(e1)
    const e2 = new MouseEvent('click', { bubbles: true, cancelable: true }); missing.dispatchEvent(e2)
    expect(e1.defaultPrevented).toBe(false); expect(e2.defaultPrevented).toBe(false)
    about.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    history.replaceState(null, '', '#about')              // jsdom pushState does update location.hash; make it explicit
    about.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(pushSpy).toHaveBeenCalledTimes(1)
  })
})
