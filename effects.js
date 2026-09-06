/* IKSN motion & micro-interaction layer.
   Loads after app.js. Everything here only adds classes/elements or reads state —
   it never calls preventDefault on a real action, never edits APP state, and never
   changes what an onclick handler does. If window.render isn't found (e.g. a future
   refactor), this file degrades gracefully via the MutationObserver fallback below. */
(function(){
'use strict';

var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

/* ---------- Pause persistent ambient loops when the tab is hidden ---------- */
document.addEventListener('visibilitychange', function(){
  document.documentElement.classList.toggle('iksn-paused', document.hidden);
});

/* ---------- Ripple on any .btn press (visual only, passive listener) ---------- */
document.addEventListener('pointerdown', function(e){
  var btn = e.target.closest && e.target.closest('.btn');
  if(!btn || btn.disabled) return;
  var rect = btn.getBoundingClientRect();
  var size = Math.max(rect.width, rect.height) * 1.6;
  var span = document.createElement('span');
  span.className = 'iksn-ripple';
  span.style.width = span.style.height = size + 'px';
  span.style.left = (e.clientX - rect.left - size / 2) + 'px';
  span.style.top = (e.clientY - rect.top - size / 2) + 'px';
  btn.appendChild(span);
  span.addEventListener('animationend', function(){ span.remove(); });
  setTimeout(function(){ if(span.parentNode) span.remove(); }, 800);
}, {passive:true});

/* ---------- Long-press progress ring for sensitive (.btn.danger) actions ----------
   Purely cosmetic + haptic layer. A normal tap still fires the button's native
   click on release regardless of hold length, so TERMINATE/REJECT/REVOKE keep
   working exactly as they did before — this only adds the visual "hold" feel. */
(function(){
  var HOLD_MS = 750, active = null, raf = null, start = 0;

  function step(){
    if(!active) return;
    var p = Math.min(1, (performance.now() - start) / HOLD_MS);
    active.style.setProperty('--hold', (p * 100).toFixed(1));
    if(p >= 1 && !active.classList.contains('armed')){
      active.classList.add('armed');
      if(navigator.vibrate) navigator.vibrate(12);
    }
    raf = requestAnimationFrame(step);
  }
  function onEnd(){
    if(active){
      active.classList.remove('holding','armed');
      active.style.setProperty('--hold','0');
      active.removeEventListener('pointerup', onEnd);
      active.removeEventListener('pointercancel', onEnd);
      active.removeEventListener('pointerleave', onEnd);
    }
    active = null;
    if(raf) cancelAnimationFrame(raf);
  }
  document.addEventListener('pointerdown', function(e){
    var btn = e.target.closest && e.target.closest('.btn.danger');
    if(!btn || btn.disabled) return;
    if(active) onEnd();
    active = btn; start = performance.now();
    btn.classList.add('holding');
    btn.addEventListener('pointerup', onEnd);
    btn.addEventListener('pointercancel', onEnd);
    btn.addEventListener('pointerleave', onEnd);
    raf = requestAnimationFrame(step);
  });
})();

/* ---------- Loading notice enhancer (only touches the "Memuat..." placeholder;
   real content that later overwrites the same container replaces this too) ---------- */
function enhanceLoadingNotices(root){
  root.querySelectorAll('.notice').forEach(function(n){
    var t = n.textContent.trim();
    if((t === 'Memuat...' || t === 'Memuat data...') && !n.dataset.iksnLoading){
      n.dataset.iksnLoading = '1';
      n.innerHTML = '<span class="iksn-loading"><span>' + t.replace('...', '').toUpperCase() + '</span><span class="bar"></span></span>';
    }
  });
}

/* ---------- Card / row entrance with stagger ---------- */
var REVEAL_SELECTOR = '.card, .person-card, .result-card, .thread-item';
function enhanceReveal(root){
  var items = root.querySelectorAll(REVEAL_SELECTOR);
  var siblingIndex = new Map();
  items.forEach(function(el){
    if(el.dataset.iksnReveal) return;
    el.dataset.iksnReveal = '1';
    var parent = el.parentElement;
    var i = siblingIndex.get(parent) || 0;
    siblingIndex.set(parent, i + 1);
    el.style.setProperty('--i', Math.min(i, 8));
    el.classList.add('mo-reveal');
  });
}

/* ---------- Sidebar active-item sliding indicator (FLIP-style) ---------- */
function positionIndicator(indicator, activeBtn, nav){
  if(!activeBtn){ indicator.style.opacity = '0'; return; }
  var navRect = nav.getBoundingClientRect();
  var btnRect = activeBtn.getBoundingClientRect();
  indicator.style.height = btnRect.height + 'px';
  indicator.style.transform = 'translateY(' + (btnRect.top - navRect.top) + 'px)';
  indicator.style.opacity = '1';
}
function enhanceNavIndicator(prevTransform){
  var nav = document.querySelector('.side-nav');
  if(!nav) return;
  var indicator = nav.querySelector('.nav-indicator');
  if(!indicator){
    indicator = document.createElement('div');
    indicator.className = 'nav-indicator';
    nav.insertBefore(indicator, nav.firstChild);
    if(prevTransform){
      indicator.style.transition = 'none';
      indicator.style.transform = prevTransform;
      void indicator.offsetHeight; /* force reflow before re-enabling transition */
      indicator.style.transition = '';
    }
  }
  var activeBtn = nav.querySelector('.nav-btn.active');
  requestAnimationFrame(function(){ positionIndicator(indicator, activeBtn, nav); });
}

/* ---------- Hero visual on the welcome / login screen ---------- */
var HERO_SVG =
  '<svg viewBox="0 0 360 360" aria-hidden="true" focusable="false">' +
  '<g class="ring-outer"><circle cx="180" cy="180" r="150" fill="none" stroke="#332e26" stroke-width="1"/><circle cx="180" cy="180" r="150" fill="none" stroke="#8d6b43" stroke-width="1" stroke-dasharray="2 16" opacity=".55"/></g>' +
  '<g class="ring-inner"><circle cx="180" cy="180" r="104" fill="none" stroke="#3d3728" stroke-width="1"/><circle cx="180" cy="180" r="104" fill="none" stroke="#cbb99b" stroke-width="1" stroke-dasharray="1 11" opacity=".45"/></g>' +
  '<g class="core"><path d="M180 96 218 112v42c0 37-22 61-38 75-16-14-38-38-38-75v-42z" fill="none" stroke="#cbb99b" stroke-width="1.3" opacity=".65"/><circle cx="180" cy="176" r="5" fill="#b08b5a" opacity=".8"/></g>' +
  '<circle cx="330" cy="120" r="2.4" fill="#b08b5a"/><circle cx="42" cy="232" r="2" fill="#8d6b43"/><circle cx="300" cy="292" r="2.2" fill="#cbb99b"/>' +
  '<path d="M180 26v18M180 316v18M26 180h18M316 180h18" stroke="#332e26" stroke-width="1"/>' +
  '</svg>';

function attachParallax(hero){
  var raf = null, tx = 0, ty = 0;
  function schedule(){
    if(raf) return;
    raf = requestAnimationFrame(function(){
      hero.style.transform = 'translate(' + tx.toFixed(1) + 'px, calc(-50% + ' + ty.toFixed(1) + 'px))';
      raf = null;
    });
  }
  window.addEventListener('pointermove', function(e){
    if(!document.body.contains(hero)) return;
    tx = ((e.clientX / window.innerWidth) - 0.5) * 16;
    ty = ((e.clientY / window.innerHeight) - 0.5) * 10;
    schedule();
  }, {passive:true});
}

function enhanceWelcome(){
  var welcome = document.querySelector('.welcome');
  if(!welcome || welcome.dataset.iksnHero) return;
  welcome.dataset.iksnHero = '1';
  var hero = document.createElement('div');
  hero.className = 'iksn-hero-visual';
  hero.innerHTML = HERO_SVG;
  welcome.appendChild(hero);
  if(!reduceMotion) attachParallax(hero);
}

function enhanceAside(root){
  root.querySelectorAll('.auth-aside').forEach(function(aside){
    if(aside.dataset.iksnAmbient) return;
    aside.dataset.iksnAmbient = '1';
    var strip = document.createElement('div');
    strip.className = 'iksn-ambient-strip';
    strip.innerHTML =
      '<span class="a-node" style="left:12%;top:24%"></span>' +
      '<span class="a-node" style="left:76%;top:62%"></span>' +
      '<span class="a-node" style="left:52%;top:40%"></span>' +
      '<span class="a-line" style="top:72%"></span>';
    aside.insertBefore(strip, aside.firstChild);
  });
}

/* ---------- Master pass: run after every render() and after any DOM update ---------- */
function enhanceAll(root, prevIndicatorTransform){
  enhanceLoadingNotices(root);
  enhanceReveal(root);
  enhanceNavIndicator(prevIndicatorTransform);
  enhanceWelcome();
  enhanceAside(root);
}

/* Wrap the app's global render() so every existing synchronous call site keeps
   working exactly as before; enhancements run immediately after, same tick. */
if(typeof window.render === 'function'){
  var _render = window.render;
  window.render = function(){
    var oldIndicator = document.querySelector('.nav-indicator');
    var prevTransform = oldIndicator ? oldIndicator.style.transform : null;
    var result = _render.apply(this, arguments);
    enhanceAll(document, prevTransform);
    return result;
  };
}

/* Fallback / catch-all: DOM updates that happen outside render() (personnel and
   requests lists, chat panel, modals, location feed) still get the same treatment. */
var pending = null;
var mo = new MutationObserver(function(){
  if(pending) return;
  pending = setTimeout(function(){ pending = null; enhanceAll(document); }, 30);
});
mo.observe(document.body, {childList:true, subtree:true});

document.addEventListener('DOMContentLoaded', function(){ enhanceAll(document); });
})();
