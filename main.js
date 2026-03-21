// Carrusel de imÃ¡genes promocionales dinÃ¡mico
document.addEventListener('DOMContentLoaded', function() {
	const carousel = document.querySelector('.promo-carousel');
	// If the page doesn't include the promo carousel, skip promo initialization
	if(!carousel){ console.debug('[promos] .promo-carousel not found - skipping promos init'); return; }
	const leftBtn = document.querySelector('.promo-arrow-left');
	const rightBtn = document.querySelector('.promo-arrow-right');
	let promoImages = [];
	let current = 0;
	let autoplayTimer = null;
	let lastPromosFetchTs = 0;
	const PROMOS_CACHE_KEY = 'landing:promo_images_v1';
	const PROMOS_CACHE_TTL_MS = 30 * 60 * 1000;

	function renderIndicators(){
		const container = carousel.parentElement.querySelector('.promo-indicators');
		if(!container) return;
		container.innerHTML = '';
		for(let i=0;i<promoImages.length;i++){
			const btn = document.createElement('button');
			btn.className = 'promo-indicator';
			btn.setAttribute('aria-label', `Ir a imagen ${i+1}`);
			btn.dataset.index = String(i);
			btn.type = 'button';
			btn.addEventListener('click', () => { current = i; renderImage(current); startAutoplay(); });
			container.appendChild(btn);
		}
		updateIndicators(current);
	}

	function updateIndicators(activeIdx){
		const container = carousel.parentElement.querySelector('.promo-indicators');
		if(!container) return;
		const nodes = container.querySelectorAll('.promo-indicator');
		nodes.forEach((n, idx) => {
			n.classList.toggle('active', idx === activeIdx);
			if(idx === activeIdx){ n.setAttribute('aria-current','true'); } else { n.removeAttribute('aria-current'); }
		});
	}

	// Cambia esta URL por la del endpoint real del backend
	const PROMOS_API = '/api/promos';

	function isFresh(ts, ttl){
		const n = Number(ts || 0);
		return Number.isFinite(n) && n > 0 && (Date.now() - n) < ttl;
	}

	function loadPromosCache(){
		try{
			const raw = localStorage.getItem(PROMOS_CACHE_KEY);
			if(!raw) return { ts: 0, items: [] };
			const parsed = JSON.parse(raw);
			const ts = Number(parsed && parsed.ts ? parsed.ts : 0);
			const items = Array.isArray(parsed && parsed.items) ? parsed.items : [];
			return { ts: Number.isFinite(ts) ? ts : 0, items: sanitizePromoItems(items) };
		}catch(_){ return { ts: 0, items: [] }; }
	}

	function savePromosCache(items){
		try{
			const normalized = sanitizePromoItems(items);
			const ts = Date.now();
			localStorage.setItem(PROMOS_CACHE_KEY, JSON.stringify({ ts, items: normalized }));
			lastPromosFetchTs = ts;
		}catch(_){ }
	}

	function sanitizePromoItems(items){
		if(!Array.isArray(items)) return [];
		return items.map(i => ({ url: i && i.url ? i.url : '', name: i && i.name ? i.name : '', alt: (i && i.alt) || (i && i.name) || '' }));
	}

	function shouldTryCrossOriginPromosFallback(){
		try{
			return window.location.origin !== 'https://backend-0lcs.onrender.com';
		}catch(_){ return true; }
	}

	function renderImage(idx) {
		if (!promoImages.length) {
			carousel.innerHTML = '<div style="text-align:center;width:100%">No hay imagenes promocionales</div>';
			return;
		}
		// Crossfade animation: insert new img and fade out the old one
		// Use two fixed image elements (front/back) to avoid DOM accumulation and visual glitches
		if (!promoImages.length) {
			// remove any imgs and show placeholder
			const existing = carousel.querySelectorAll('img');
			existing.forEach(n => n.parentNode && n.parentNode.removeChild(n));
			carousel.innerHTML = '<div style="text-align:center;width:100%">No hay imagenes promocionales</div>';
			return;
		}
		// ensure two image slots exist
		let slotA = carousel.querySelector('.promo-slot-A');
		let slotB = carousel.querySelector('.promo-slot-B');
		if(!slotA){ slotA = document.createElement('img'); slotA.className = 'promo-img promo-slot-A'; slotA.style.zIndex = 1; carousel.appendChild(slotA); }
		if(!slotB){ slotB = document.createElement('img'); slotB.className = 'promo-img promo-slot-B'; slotB.style.zIndex = 0; carousel.appendChild(slotB); }
		// track active slot on the carousel element
		if(typeof carousel._activeSlot === 'undefined') carousel._activeSlot = 0; // 0 -> A visible, 1 -> B visible
		const activeSlot = carousel._activeSlot;
		const activeImg = activeSlot === 0 ? slotA : slotB;
		const nextImg = activeSlot === 0 ? slotB : slotA;
		// prepare next image
		nextImg.src = promoImages[idx].url;
		nextImg.alt = promoImages[idx].alt || 'Imagen promocional';
		nextImg.classList.remove('visible','exiting');
		nextImg.style.zIndex = 2;
		// force reflow then make it visible
		void nextImg.offsetWidth;
		nextImg.classList.add('visible');
		// hide active image
		activeImg.classList.remove('visible');
		activeImg.classList.add('exiting');
		activeImg.style.zIndex = 1;
		// cleanup exiting class after transition
		const FADE_MS = 600;
		const onCleanup = () => { activeImg.classList.remove('exiting'); };
		activeImg.addEventListener('transitionend', function handler(){ activeImg.removeEventListener('transitionend', handler); onCleanup(); });
		setTimeout(onCleanup, FADE_MS + 80);
		// flip active slot
		carousel._activeSlot = 1 - activeSlot;
		// update indicators to reflect current
		try{ updateIndicators(current); }catch(_){ }
	}

	function showPrev() {
		if (!promoImages.length) return;
		current = (current - 1 + promoImages.length) % promoImages.length;
		renderImage(current);
	}
	function showNext() {
		if (!promoImages.length) return;
		current = (current + 1) % promoImages.length;
		renderImage(current);
	}

	leftBtn && leftBtn.addEventListener('click', showPrev);
	rightBtn && rightBtn.addEventListener('click', showNext);

	// Encapsular fetch+render en una funciÃ³n para reuso
	async function loadPromos({ force = false } = {}){
		const cached = loadPromosCache();
		if(!force && Array.isArray(promoImages) && isFresh(lastPromosFetchTs || cached.ts, PROMOS_CACHE_TTL_MS)) return;
		if(!force && isFresh(cached.ts, PROMOS_CACHE_TTL_MS)){
			promoImages = cached.items;
			lastPromosFetchTs = cached.ts;
			if(promoImages.length){
				if(current >= promoImages.length) current = 0;
				renderIndicators();
				renderImage(current);
				startAutoplay();
			}else{
				carousel.innerHTML = '<div style="text-align:center;width:100%">No hay imagenes promocionales</div>';
			}
			return;
		}
		try{
			const resp = await fetch(PROMOS_API);
			if(resp.ok){
				const data = await resp.json();
				if(Array.isArray(data)){
					promoImages = sanitizePromoItems(data);
					savePromosCache(promoImages);
					if(!promoImages.length){ carousel.innerHTML = '<div style="text-align:center;width:100%">No hay imagenes promocionales</div>'; return; }
					if(current >= promoImages.length) current = 0;
					renderIndicators();
					renderImage(current);
					// arrancar autoplay luego de cargar imÃ¡genes
					startAutoplay();
					return;
				}
			}
		}catch(e){ /* ignore and fallback */ }
		// fallback to explicit backend origin only when the page runs on another origin
		if(shouldTryCrossOriginPromosFallback()){
			try{
				const r2 = await fetch('https://backend-0lcs.onrender.com/api/promos');
				if(r2.ok){
					let d2 = await r2.json();
					if(Array.isArray(d2)){
						d2 = d2.map(i => { if (i && i.url && i.url.startsWith('/')) i.url = 'https://backend-0lcs.onrender.com' + i.url; return i; });
						promoImages = sanitizePromoItems(d2);
						savePromosCache(promoImages);
						if(!promoImages.length){ carousel.innerHTML = '<div style="text-align:center;width:100%">No hay imagenes promocionales</div>'; return; }
						if(current >= promoImages.length) current = 0;
						renderIndicators();
						renderImage(current);
						// arrancar autoplay luego de cargar imÃ¡genes
						startAutoplay();
						return;
					}
				}
			}catch(e){ /* final fallback */ }
		}
		if(cached.ts){
			promoImages = cached.items;
			lastPromosFetchTs = cached.ts;
			if(promoImages.length){
				if(current >= promoImages.length) current = 0;
				renderIndicators();
				renderImage(current);
				startAutoplay();
			}else{
				carousel.innerHTML = '<div style="text-align:center;width:100%">No hay imagenes promocionales</div>';
			}
			return;
		}
		carousel.innerHTML = '<div style="text-align:center;width:100%">No se pudieron cargar las imagenes</div>';
	}

	// iniciar carga inicial
	loadPromos();

	// autoplay cada 10s
	function startAutoplay(){
		stopAutoplay();
		if(promoImages && promoImages.length>1){
			autoplayTimer = setInterval(() => { showNext(); }, 10000);
		}
	}
	function stopAutoplay(){ if(autoplayTimer){ clearInterval(autoplayTimer); autoplayTimer = null; } }

	// pause autoplay on hover or focus for better UX
	carousel.addEventListener('mouseenter', () => { stopAutoplay(); });
	carousel.addEventListener('mouseleave', () => { startAutoplay(); });
	carousel.addEventListener('focusin', () => { stopAutoplay(); });
	carousel.addEventListener('focusout', () => { startAutoplay(); });

	startAutoplay();

	document.addEventListener('visibilitychange', () => {
		if(document.visibilityState === 'hidden'){
			stopAutoplay();
			return;
		}
		startAutoplay();
		if(!isFresh(lastPromosFetchTs, PROMOS_CACHE_TTL_MS)) loadPromos({ force: true });
	});

	// limpiar al salir
	window.addEventListener('beforeunload', () => { stopAutoplay(); });
});

const DEFERRED_IMAGE_PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

function hydrateDeferredImageElement(img){
	if(!img || img.dataset.deferredLoaded === '1') return;
	try{
		const picture = img.closest ? img.closest('picture') : null;
		if (picture){
			picture.querySelectorAll('source[data-defer-srcset]').forEach((source) => {
				const srcset = source.getAttribute('data-defer-srcset') || '';
				if (srcset) source.setAttribute('srcset', srcset);
				source.removeAttribute('data-defer-srcset');
			});
		}
		const src = img.getAttribute('data-defer-src') || '';
		const srcset = img.getAttribute('data-defer-srcset') || '';
		if (src) img.setAttribute('src', src);
		if (srcset) img.setAttribute('srcset', srcset);
		img.dataset.deferredLoaded = '1';
		img.removeAttribute('data-defer-src');
		img.removeAttribute('data-defer-srcset');
	}catch(_){ }
}

function initDeferredImageHydration(root = document){
	try{
		const scope = root && typeof root.querySelectorAll === 'function' ? root : document;
		const imgs = Array.from(scope.querySelectorAll('img[data-defer-src]'));
		if (!imgs.length) return;
		if (typeof IntersectionObserver === 'undefined'){
			imgs.forEach(hydrateDeferredImageElement);
			return;
		}
		if (!window.__deferredImageObserver){
			window.__deferredImageObserver = new IntersectionObserver((entries, observer) => {
				entries.forEach((entry) => {
					if (!entry.isIntersecting) return;
					hydrateDeferredImageElement(entry.target);
					observer.unobserve(entry.target);
				});
			}, { rootMargin: '96px 0px' });
		}
		imgs.forEach((img) => {
			if (img.dataset.deferredObserved === '1') return;
			img.dataset.deferredObserved = '1';
			window.__deferredImageObserver.observe(img);
		});
	}catch(_){ }
}

window.DEFERRED_IMAGE_PLACEHOLDER = DEFERRED_IMAGE_PLACEHOLDER;
window.hydrateDeferredImageElement = hydrateDeferredImageElement;
window.initDeferredImageHydration = initDeferredImageHydration;

document.addEventListener('DOMContentLoaded', () => {
	try{ initDeferredImageHydration(document); }catch(_){ }
});

// Simple cookie consent manager (kept inside main.js to avoid an extra request).
(function(){
	const CONSENT_KEY = 'site:cookie_consent_v1';
	const DEFAULT_CONSENT = { necessary: true, analytics: false, marketing: false };

	function readConsent(){
		try{
			const raw = localStorage.getItem(CONSENT_KEY);
			if (!raw) return null;
			const parsed = JSON.parse(raw);
			if (!parsed || typeof parsed !== 'object') return null;
			return Object.assign({}, DEFAULT_CONSENT, parsed);
		}catch(_){ return null; }
	}

	function saveConsent(consent){
		try{
			const payload = Object.assign({
				necessary: true,
				analytics: !!consent.analytics,
				marketing: !!consent.marketing,
				ts: Date.now()
			}, consent || {});
			localStorage.setItem(CONSENT_KEY, JSON.stringify(payload));
			document.documentElement.dataset.cookieConsent = payload.analytics || payload.marketing ? 'full' : 'essential';
			document.dispatchEvent(new CustomEvent('cookie:consent', { detail: payload }));
		}catch(_){ }
	}

	function ensureBanner(){
		if (document.getElementById('cookieBanner')) return;
		const banner = document.createElement('div');
		banner.id = 'cookieBanner';
		banner.className = 'cookie-banner';
		banner.setAttribute('role', 'dialog');
		banner.setAttribute('aria-live', 'polite');
		banner.innerHTML = `
			<div class="cookie-copy">
				<h4>Preferencias de cookies</h4>
				<p>Usamos cookies necesarias para que el sitio funcione y opcionales para analiticas. Podes aceptar todo o elegir que permitir.</p>
			</div>
			<div class="cookie-actions">
				<button class="btn btn-primary" id="cookieAcceptAll" type="button">Aceptar todo</button>
				<button class="btn btn-ghost" id="cookieReject" type="button">Rechazar opcionales</button>
				<button class="btn" id="cookieConfig" type="button">Configurar</button>
			</div>
			<div class="cookie-settings" id="cookieSettings">
				<label class="cookie-toggle">
					<input type="checkbox" checked disabled />
					Necesarias (siempre activas)
				</label>
				<label class="cookie-toggle">
					<input type="checkbox" id="cookieAnalytics" />
					Analiticas
				</label>
				<label class="cookie-toggle">
					<input type="checkbox" id="cookieMarketing" />
					Marketing
				</label>
				<div class="cookie-actions">
					<button class="btn btn-primary" id="cookieSave" type="button">Guardar preferencias</button>
				</div>
			</div>
		`;
		document.body.appendChild(banner);

		const settings = banner.querySelector('#cookieSettings');
		const btnConfig = banner.querySelector('#cookieConfig');
		const btnAccept = banner.querySelector('#cookieAcceptAll');
		const btnReject = banner.querySelector('#cookieReject');
		const btnSave = banner.querySelector('#cookieSave');
		const analyticsToggle = banner.querySelector('#cookieAnalytics');
		const marketingToggle = banner.querySelector('#cookieMarketing');

		btnConfig.addEventListener('click', () => {
			settings.classList.toggle('open');
		});

		btnAccept.addEventListener('click', () => {
			saveConsent({ analytics: true, marketing: true });
			banner.remove();
		});

		btnReject.addEventListener('click', () => {
			saveConsent({ analytics: false, marketing: false });
			banner.remove();
		});

		btnSave.addEventListener('click', () => {
			saveConsent({ analytics: !!analyticsToggle.checked, marketing: !!marketingToggle.checked });
			banner.remove();
		});
	}

	function openSettings(){
		const existing = document.getElementById('cookieBanner');
		if (existing) {
			const settings = existing.querySelector('#cookieSettings');
			if (settings) settings.classList.add('open');
			return;
		}
		ensureBanner();
		const created = document.getElementById('cookieBanner');
		const settings = created && created.querySelector('#cookieSettings');
		if (settings) settings.classList.add('open');
	}

	function initCookieConsent(){
		const consent = readConsent();
		if (!consent) {
			ensureBanner();
		} else {
			document.documentElement.dataset.cookieConsent = consent.analytics || consent.marketing ? 'full' : 'essential';
		}

		document.querySelectorAll('.cookie-settings-link').forEach((btn) => {
			btn.addEventListener('click', (ev) => {
				ev.preventDefault();
				openSettings();
			});
		});

		window.openCookieSettings = openSettings;
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initCookieConsent);
	} else {
		initCookieConsent();
	}
})();
// Mobile menu toggle
const menuToggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('.nav');
if(menuToggle){
	menuToggle.addEventListener('click', () => {
		nav.classList.toggle('open');
		const expanded = menuToggle.getAttribute('aria-expanded') === 'true';
		const now = !expanded;
		menuToggle.setAttribute('aria-expanded', String(now));
		// Swap visual icon for close/open and prevent body scroll when open.
		// Use unicode escapes to avoid mojibake in environments with wrong encoding.
		menuToggle.textContent = now ? '\u2715' : '\u2630';
		document.body.classList.toggle('nav-open', now);
	});

	// Ensure menu closes when resizing to desktop widths
	window.addEventListener('resize', () => {
		if (window.innerWidth > 900 && nav.classList.contains('open')) {
			nav.classList.remove('open');
			menuToggle.setAttribute('aria-expanded','false');
			menuToggle.textContent = '\u2630';
			document.body.classList.remove('nav-open');
		}
	});
}

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
	anchor.addEventListener('click', function (e) {
		const targetId = this.getAttribute('href');
		if (targetId && targetId.startsWith('#')) {
			e.preventDefault();
			const el = document.querySelector(targetId);
			if (el) el.scrollIntoView({behavior: 'smooth', block: 'start'});
			// close mobile nav when clicked
			if (nav.classList.contains('open')) {
				nav.classList.remove('open');
				document.body.classList.remove('nav-open');
				if(menuToggle){
					menuToggle.setAttribute('aria-expanded','false');
					menuToggle.textContent = '\u2630';
				}
			}
		}
	});
});

// Ensure mailto links reliably open (fallback if another handler prevents default)
document.addEventListener('click', (e) => {
	const mail = e.target && e.target.closest ? e.target.closest('a[href^="mailto:"]') : null;
	if (!mail) return;
	// Open Gmail composer preserving subject/body.
	// Only inject the CV template for CV-related links.
	try {
		e.preventDefault();
		e.stopPropagation();
		const href = mail.getAttribute('href') || '';
		// parse mailto:to?subject=...&body=...
		let to = '';
		let params = '';
		if (href.startsWith('mailto:')){
			const rest = href.slice(7);
			const parts = rest.split('?');
			to = parts[0] || '';
			params = parts[1] || '';
		}
		const usp = new URLSearchParams(params);
		const subject = usp.get('subject') || '';
		const body = usp.get('body') || '';
		const intentText = (
			String(subject || '') + ' ' +
			String(body || '') + ' ' +
			String(mail.getAttribute('data-mail-intent') || '') + ' ' +
			String(mail.textContent || '')
		).toLowerCase();
		const isCvIntent = /(?:\bcv\b|curriculum|trabaj)/i.test(intentText);
		const professionalBody = isCvIntent
			? (
				(body ? body + '\n\n' : '') +
				'Estimado/a equipo de DistriAr,\n\n' +
				'Adjunto mi curriculum vitae para postularme a oportunidades laborales en su empresa.\n' +
				'Quedo a disposicion para brindar mas informacion y coordinar una entrevista si asi lo consideran oportuno.\n\n' +
				'Atentamente,\n' +
				'[Nombre y Apellido]\n' +
				'[Telefono]\n\n' +
				'Por favor adjunte su CV a este correo antes de enviarlo.'
			)
			: body;
		const gmailUrl = 'https://mail.google.com/mail/?view=cm&fs=1' +
			(to ? '&to=' + encodeURIComponent(to) : '') +
			(subject ? '&su=' + encodeURIComponent(subject) : '') +
			'&body=' + encodeURIComponent(professionalBody || '');
		// Open Gmail composer in a new tab/window. If popup blocked, fallback to mailto navigation.
		const w = window.open(gmailUrl, '_blank');
		if (!w) {
			window.location.href = href; // fallback to default mail client
		}
	} catch (err) {
		// fallback: navigate to mailto if anything fails
		try { window.location.href = mail.href; } catch(e){}
	}
});

// Scroll reveal for cards and sections
const observer = new IntersectionObserver((entries) => {
	entries.forEach(entry => {
		if(entry.isIntersecting){
			entry.target.classList.add('in-view');
		}
	});
},{threshold: 0.15});
document.querySelectorAll('.card, .log-card, .about-text, .about-values, .product-card, .hero-text, .hero-order-card, .shortcut-card').forEach(el => {
	observer.observe(el);
});

