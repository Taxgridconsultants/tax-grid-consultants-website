(() => {
  const header = document.querySelector('[data-header]');
  const menuButton = document.querySelector('[data-menu-button]');
  const nav = document.querySelector('[data-nav]');
  const reveals = document.querySelectorAll('.reveal');
  const year = document.querySelector('[data-year]');
  const form = document.getElementById('consultation-form');

  if (year) year.textContent = new Date().getFullYear();
  const updateHeader = () => header?.classList.toggle('scrolled', window.scrollY > 24);
  updateHeader();
  window.addEventListener('scroll', updateHeader, { passive: true });

  menuButton?.addEventListener('click', () => {
    const open = document.body.classList.toggle('menu-open');
    menuButton.setAttribute('aria-expanded', String(open));
  });
  nav?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
    document.body.classList.remove('menu-open');
    menuButton?.setAttribute('aria-expanded', 'false');
  }));

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: .12, rootMargin: '0px 0px -45px' });
  reveals.forEach(el => observer.observe(el));

  document.querySelectorAll('.faq-item button').forEach(button => {
    button.addEventListener('click', () => {
      const item = button.closest('.faq-item');
      const open = item.classList.contains('open');
      document.querySelectorAll('.faq-item').forEach(other => {
        other.classList.remove('open');
        other.querySelector('button')?.setAttribute('aria-expanded', 'false');
      });
      if (!open) {
        item.classList.add('open');
        button.setAttribute('aria-expanded', 'true');
      }
    });
  });

  document.querySelectorAll('[data-intent]').forEach(link => {
    link.addEventListener('click', () => {
      const intent = link.getAttribute('data-intent') || '';
      const messageField = form?.querySelector('[name="message"]');
      if (messageField && !messageField.value.trim()) messageField.value = intent;
    });
  });

  form?.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(form);
    const name = String(data.get('name') || '').trim();
    const company = String(data.get('company') || '').trim();
    const email = String(data.get('email') || '').trim();
    const phone = String(data.get('phone') || '').trim();
    const service = String(data.get('service') || '').trim();
    const message = String(data.get('message') || '').trim();
    const channel = event.submitter?.value || 'whatsapp';

    const plainText = `Hello Tax Grid Consultants,

I would like to request a consultation.

Name: ${name}
Company: ${company || 'Not provided'}
Email: ${email}
Phone: ${phone || 'Not provided'}
Service: ${service || 'General consultation'}

Situation:
${message || 'I would like to discuss the support TGC can provide.'}`;

    if (channel === 'email') {
      const subject = encodeURIComponent(`Consultation request — ${service || 'TGC services'}${company ? ` — ${company}` : ''}`);
      window.location.href = `mailto:info@taxgridconsultants.com?subject=${subject}&body=${encodeURIComponent(plainText)}`;
      return;
    }

    window.open(`https://wa.me/23052577613?text=${encodeURIComponent(plainText)}`, '_blank', 'noopener');
  });
})();