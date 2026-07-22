(() => {
  'use strict';
  const qs=(s,c=document)=>c.querySelector(s), qsa=(s,c=document)=>[...c.querySelectorAll(s)];
  const safeStorage={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
  const common={
    en:{languageName:'English',htmlLang:'en',skip:'Skip to content',openMenu:'Open menu',navServices:'Services',navWhy:'Why Tax Grid',navAbout:'About',navContact:'Contact',book:'Request a consultation',back:'Back to website',onPage:'ON THIS PAGE',footerSummary:'Accounting, tax, payroll and advisory support for businesses in Mauritius.',footerServices:'Services',footerExplore:'Explore',footerContact:'Contact',serviceAccounting:'Accounting & Bookkeeping',serviceTax:'Tax & VAT',servicePayroll:'Payroll',serviceReporting:'Reporting & Advisory',serviceCompany:'Company Services',serviceXero:'Xero Support',privacy:'Privacy Notice',disclaimer:'Website disclaimer'},
    fr:{languageName:'Français',htmlLang:'fr',skip:'Aller au contenu',openMenu:'Ouvrir le menu',navServices:'Services',navWhy:'Pourquoi Tax Grid',navAbout:'À propos',navContact:'Contact',book:'Demander une consultation',back:'Retour au site',onPage:'SUR CETTE PAGE',footerSummary:'Comptabilité, fiscalité, paie et conseil pour les entreprises à Maurice.',footerServices:'Services',footerExplore:'Explorer',footerContact:'Contact',serviceAccounting:'Comptabilité et tenue de livres',serviceTax:'Fiscalité et TVA',servicePayroll:'Paie',serviceReporting:'Rapports de gestion et conseil',serviceCompany:'Services aux sociétés',serviceXero:'Assistance Xero',privacy:'Avis de confidentialité',disclaimer:'Avertissement du site'},
    mfe:{languageName:'Kreol Morisien',htmlLang:'mfe',skip:'Al dan konteni',openMenu:'Ouver meni',navServices:'Servis',navWhy:'Kifer Tax Grid',navAbout:'Lor nou',navContact:'Kontakte nou',book:'Demann enn konsiltasion',back:'Retourn lor sit',onPage:'LOR SA PAZ-LA',footerSummary:'Sipor kontabilite, tax, lapey ek konsey pou bann biznes Moris.',footerServices:'Servis',footerExplore:'Explore',footerContact:'Kontak',serviceAccounting:'Kontabilite ek teni liv',serviceTax:'Tax ek VAT',servicePayroll:'Lapey',serviceReporting:'Rapor zestion ek konsey',serviceCompany:'Servis pou konpagni',serviceXero:'Sipor Xero',privacy:'Notis Konfidansialite',disclaimer:'Avertisman sit web'}
  };
  let lang=safeStorage.get('tgc-language')||'en'; if(!common[lang])lang='en';
  function render(){
    const dict=common[lang], page=window.TGC_LEGAL_CONTENT[lang]; document.documentElement.lang=dict.htmlLang;
    qsa('[data-legal]').forEach(el=>{const k=el.dataset.legal;if(dict[k]!==undefined)el.textContent=dict[k]});
    qs('[data-current-language]').textContent=dict.languageName;
    qsa('[data-language-menu] button').forEach(b=>{const sel=b.dataset.lang===lang;b.setAttribute('aria-selected',String(sel));b.tabIndex=sel?0:-1});
    qs('[data-page-kicker]').textContent=page.kicker;qs('[data-page-title]').textContent=page.title;qs('[data-page-lead]').textContent=page.lead;qs('[data-page-updated]').textContent=page.updated;
    const toc=qs('[data-legal-toc]'),content=qs('[data-legal-content]');toc.innerHTML='';content.innerHTML='';
    page.sections.forEach(([heading,text],i)=>{const a=document.createElement('a');a.href=`#legal-${i+1}`;a.textContent=heading;toc.appendChild(a);const section=document.createElement('section');section.id=`legal-${i+1}`;section.innerHTML=`<h2>${heading}</h2><p>${text}</p>`;content.appendChild(section)});
    document.title=`${page.title} | Tax Grid Consultants`;
    const meta=qs('meta[name="description"]');if(meta)meta.content=page.lead;
    renderFooterLanguages();
  }
  function setLanguage(code){lang=common[code]?code:'en';safeStorage.set('tgc-language',lang);render();qs('[data-language-control]').classList.remove('open');qs('[data-language-button]').setAttribute('aria-expanded','false')}
  const lb=qs('[data-language-button]');lb.addEventListener('click',()=>{const c=qs('[data-language-control]'),open=c.classList.toggle('open');lb.setAttribute('aria-expanded',String(open))});qsa('[data-language-menu] button').forEach(b=>b.addEventListener('click',()=>setLanguage(b.dataset.lang)));document.addEventListener('click',e=>{if(!e.target.closest('[data-language-control]')){qs('[data-language-control]').classList.remove('open');lb.setAttribute('aria-expanded','false')}});
  function renderFooterLanguages(){const box=qs('[data-footer-language]');box.innerHTML='';Object.entries(common).forEach(([code,pack])=>{const b=document.createElement('button');b.type='button';b.textContent=pack.languageName;b.className=code===lang?'active':'';b.setAttribute('aria-pressed',String(code===lang));b.addEventListener('click',()=>setLanguage(code));box.appendChild(b)})}
  const mt=qs('[data-menu-toggle]'),menu=qs('[data-menu]');mt.addEventListener('click',()=>{const open=menu.classList.toggle('open');mt.setAttribute('aria-expanded',String(open));document.body.classList.toggle('menu-open',open)});qsa('.primary-nav a,.header-actions a').forEach(a=>a.addEventListener('click',()=>{menu.classList.remove('open');mt.setAttribute('aria-expanded','false');document.body.classList.remove('menu-open')}));
  const header=qs('[data-header]');const update=()=>header.classList.toggle('scrolled',scrollY>18);addEventListener('scroll',update,{passive:true});update();qs('[data-year]').textContent=new Date().getFullYear();render();
})();
