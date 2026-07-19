(() => {
  const body = document.body;
  const header = document.querySelector('[data-header]');
  const menuToggle = document.querySelector('[data-menu-toggle]');
  const menu = document.querySelector('[data-menu]');
  const years = document.querySelectorAll('[data-year]');
  const revealItems = document.querySelectorAll('.reveal');

  years.forEach(el => el.textContent = new Date().getFullYear());

  const updateHeader = () => header?.classList.toggle('is-scrolled', window.scrollY > 20);
  updateHeader();
  window.addEventListener('scroll', updateHeader, { passive: true });

  menuToggle?.addEventListener('click', () => {
    const open = body.classList.toggle('menu-open');
    menuToggle.setAttribute('aria-expanded', String(open));
  });
  menu?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
    body.classList.remove('menu-open');
    menuToggle?.setAttribute('aria-expanded', 'false');
  }));

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -45px' });
    revealItems.forEach(item => observer.observe(item));
  } else {
    revealItems.forEach(item => item.classList.add('in-view'));
  }

  const form = document.getElementById('consultationForm');
  if (form) {
    const buildMessage = () => {
      const data = new FormData(form);
      const value = key => String(data.get(key) || '').trim();
      return `Hello Tax Grid Consultants,

I would like to request a consultation.

Name: ${value('name')}
Company: ${value('company') || 'Not provided'}
Email: ${value('email')}
Phone / WhatsApp: ${value('phone') || 'Not provided'}
Business connection: ${value('location') || 'Not provided'}
Area: ${value('service') || 'General consultation'}

Situation:
${value('message') || 'I would like to discuss the support TGC can provide.'}

Regards,
${value('name')}`;
    };
    form.querySelectorAll('[data-submit-channel]').forEach(button => {
      button.addEventListener('click', () => {
        if (!form.reportValidity()) return;
        const message = buildMessage();
        if (button.dataset.submitChannel === 'whatsapp') {
          window.open(`https://wa.me/23052577613?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
        } else {
          const data = new FormData(form);
          const company = String(data.get('company') || '').trim();
          const service = String(data.get('service') || 'TGC consultation').trim();
          const subject = encodeURIComponent(`Consultation request — ${service}${company ? ` — ${company}` : ''}`);
          window.location.href = `mailto:info@taxgridconsultants.com?subject=${subject}&body=${encodeURIComponent(message)}`;
        }
      });
    });
  }
})();