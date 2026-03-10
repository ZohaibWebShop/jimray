(() => {
  // Number formatting functions
  function formatNumber(num) {
    return new Intl.NumberFormat('en-US').format(num);
  }

  function formatPrice(price) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(price);
  }

  function getConfig() {
    const el = document.querySelector('[data-quote-request-config]');
    if (!el) return null;
    return {
      apiBaseUrl: el.getAttribute('data-api-base-url') || '',
      secret: el.getAttribute('data-secret') || '',
      customerId: el.getAttribute('data-customer-id') || '',
      customerEmail: el.getAttribute('data-customer-email') || '',
      customerName: el.getAttribute('data-customer-name') || '',
      customerTags: (el.getAttribute('data-customer-tags') || '').split(',').map(t => t.trim()).filter(Boolean),
    };
  }

  async function fetchCart() {
    const res = await fetch('/cart.js', { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('Failed to fetch cart');
    return res.json();
  }

  function mapCartItems(cart) {
    const origin = window.location.origin;
    return (cart.items || []).map((it) => {
      const productUrl = it.url ? `${origin}${it.url}` : null;
      const imageUrl = it.featured_image && it.featured_image.url ? it.featured_image.url : null;

      const variantId = it.variant_id != null ? String(it.variant_id) : null;
      const price = it.final_price != null
        ? Number(it.final_price) / 100
        : it.price != null
          ? Number(it.price) / 100
          : null;

      return {
        productId: it.product_id != null ? String(it.product_id) : null,
        variantId,
        title: it.product_title || it.title,
        variantTitle: it.variant_title || null,
        sku: it.sku || null,
        quantity: it.quantity,
        price,
        imageUrl,
        productUrl,
      };
    });
  }

  async function submitQuote({ apiBaseUrl, secret, customerId, customerEmail, customerName, customerTags, note }) {
    if (!apiBaseUrl) throw new Error('Missing apiBaseUrl');
    const cart = await fetchCart();

    const items = mapCartItems(cart);

    if (!items.length) {
      const err = new Error('Cart is empty');
      err.code = 'EMPTY_CART';
      throw err;
    }

    const payload = {
      customer: {
        shopifyCustomerId: String(customerId),
        email: String(customerEmail),
        name: String(customerName || ''),
      },
      items,
      note: note || null,
    };

    const res = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/api/quotes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-QUOTE-SECRET': secret,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      let msg = 'Quote submission failed';
      try {
        const j = await res.json();
        if (j && j.error) msg = j.error;
      } catch (_) {}
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }

    const result = await res.json();
    return result;
  }

  async function clearCart() {
    await fetch('/cart/clear.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({}),
    });
  }

  async function loadHistory({ apiBaseUrl, secret, customerId }) {
    const res = await fetch(
      `${apiBaseUrl.replace(/\/$/, '')}/api/quotes?shopifyCustomerId=${encodeURIComponent(customerId)}`,
      {
        headers: {
          Accept: 'application/json',
          'X-QUOTE-SECRET': secret,
        },
      }
    );

    if (!res.ok) throw new Error('Failed to load quote history');
    return res.json();
  }

  async function loadQuoteById({ apiBaseUrl, secret, customerId, quoteId }) {
    const res = await fetch(
      `${apiBaseUrl.replace(/\/$/, '')}/api/quotes/${encodeURIComponent(quoteId)}?shopifyCustomerId=${encodeURIComponent(
        customerId
      )}`,
      {
        headers: {
          Accept: 'application/json',
          'X-QUOTE-SECRET': secret,
        },
      }
    );

    if (!res.ok) throw new Error('Failed to load quote');
    return res.json();
  }

  function setSubmitting(container, submitting) {
    const btn = container.querySelector('[data-quote-submit]');
    const spinner = container.querySelector('[data-quote-submit-spinner]');
    if (btn) btn.toggleAttribute('disabled', submitting);
    if (spinner) spinner.toggleAttribute('hidden', !submitting);
  }

  function showMessage(container, type, text) {
    const ok = container.querySelector('[data-quote-message-ok]');
    const err = container.querySelector('[data-quote-message-error]');

    if (ok) ok.toggleAttribute('hidden', !(type === 'ok'));
    if (err) err.toggleAttribute('hidden', !(type === 'error'));

    if (type === 'ok' && ok) ok.textContent = text;
    if (type === 'error' && err) err.textContent = text;
  }

  function renderHistory(container, quotes) {
    const target = container.querySelector('[data-quote-history]');
    if (!target) return;

    if (!quotes || quotes.length === 0) {
      target.innerHTML = '<p>No quote requests yet.</p>';
      return;
    }

    const html = quotes
      .map((q) => {
        const rows = (q.items || [])
          .map((it, idx) => {
            const title = `${it.title || ''}${it.variantTitle ? ` — ${it.variantTitle}` : ''}`;
            const link = it.productUrl ? `<a href="${it.productUrl}" style="color:#111827;text-decoration:underline;">${title}</a>` : title;
            const img = it.imageUrl
              ? `<img src="${it.imageUrl}" alt="" loading="lazy" style="width:100%;max-width:100px;height:auto;object-fit:contain;border-radius:6px;display:block;margin:0 auto;" />`
              : '';

            const sku = it.sku ? String(it.sku) : '';
            const price = it.price != null && it.price !== '' ? Number(it.price) : null;
            let priceDisplay = '';
            if (price != null && !Number.isNaN(price)) {
              const lineTotal = price * it.quantity;
              priceDisplay = `<div style="line-height:1.4;font-size:14px;">${formatPrice(price)} × ${formatNumber(it.quantity)}<br/><strong>${formatPrice(lineTotal)}</strong></div>`;
            }

            const bgColor = idx % 2 === 0 ? '#ffffff' : 'rgba(var(--color-foreground), 0.03)';

            return `
              <tr style="background:${bgColor}; display: table-row !important;">
                <td style="padding:0.75rem 0.5rem; width:80px; text-align:center; vertical-align:middle; display: table-cell !important;">${img}</td>
                <td style="padding:0.75rem 0.5rem; vertical-align:middle; display: table-cell !important;">
                  <div style="font-weight:600;">${link}</div>
                </td>
                <td style="padding:0.75rem 0.5rem; text-align:right; white-space:nowrap; vertical-align:middle; display: table-cell !important;font-size:14px;color:rgba(var(--color-foreground), 0.75);">${sku}</td>
                <td style="padding:0.75rem 0.5rem; text-align:right; vertical-align:middle; display: table-cell !important;color:rgba(var(--color-foreground), 0.75);">${priceDisplay}</td>
                <td style="padding:0.75rem 0.5rem; text-align:right; white-space:nowrap; vertical-align:middle; display: table-cell !important;font-size:14px;color:rgba(var(--color-foreground), 0.75);">${formatNumber(it.quantity)}</td>
              </tr>
            `;
          })
          .join('');

        return `
          <div class="quote-history__item" style="margin-bottom: 4rem;">
            <div style="max-width: 920px; margin: 0 auto;">
              <div style="background:#ffffff; border: 1px solid rgba(var(--color-foreground), 0.12); border-radius: 12px; overflow:hidden;">
                <div style="background:#7b0303; color:#ffffff; padding: 0.9rem 1rem;">
                  <div style="display:flex; justify-content:space-between; gap: 1rem; flex-wrap:wrap; align-items:baseline;">
                    <div style="font-weight:800;">
                      <a href="/pages/quote-details?quoteId=${encodeURIComponent(q.id)}" style="color:#ffffff; text-decoration:none;">Quote #QT-${q.quoteNumber}</a>
                    </div>
                    <div style="opacity:0.95;"><a href="/pages/quote-details?quoteId=${encodeURIComponent(q.id)}" style="color:#ffffff;">View quote</a></div>
                  </div>
                </div>
                <div style="padding: 1rem;">
                  ${q.status ? `<div style="margin-top:0.25rem;"><strong>Status:</strong> ${q.status}</div>` : ''}
                  <div style="margin-top:0.25rem;"><strong>Submitted:</strong> ${new Date(q.createdAt).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: '2-digit',
                  })}</div>
                  ${q.note ? `<div style="margin-top:0.5rem;"><strong>Notes:</strong> ${q.note}</div>` : ''}
                </div>
                <div style="overflow-x: auto; -webkit-overflow-scrolling: touch;">
                  <table style="width:100% !important; min-width: 500px; border-collapse: collapse; border-top: 1px solid rgba(var(--color-foreground), 0.12); display: table !important;">
                    <thead style="display: table-header-group !important;">
                      <tr style="text-align:left; border-bottom: 1px solid rgba(var(--color-foreground), 0.12); display: table-row !important;">
                        <th style="padding:0.5rem; display: table-cell !important;"></th>
                        <th style="padding:0.5rem; display: table-cell !important;">Item</th>
                        <th style="padding:0.5rem; display: table-cell !important;">SKU</th>
                        <th style="padding:0.5rem; text-align:right; display: table-cell !important;">Price</th>
                        <th style="padding:0.5rem; text-align:right; display: table-cell !important;">Qty</th>
                      </tr>
                    </thead>
                    <tbody style="display: table-row-group !important;">${rows}</tbody>
                  </table>
                </div>
                <div style="height:4px; background:#ececec;"></div>
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    target.innerHTML = html;
  }

  function renderLatestHistory(container, quotes) {
    const target = container.querySelector('[data-quote-history-latest]');
    if (!target) return;

    if (!quotes || quotes.length === 0) {
      target.innerHTML = '<p>No quotes submitted yet.</p>';
      return;
    }

    const latest = quotes.slice(0, 3);

    const html = latest
      .map((q) => {
        const items = (q.items || []).slice(0, 3);
        const itemsHtml = items
          .map((it, idx) => {
            const title = `${it.title || ''}${it.variantTitle ? ` — ${it.variantTitle}` : ''}`;
            const link = it.productUrl ? `<a href="${it.productUrl}" style="color:#111827;text-decoration:underline;line-height:22px;">${title}</a>` : title;
            const img = it.imageUrl
              ? `<img src="${it.imageUrl}" alt="" loading="lazy" style="width:64px;height:64px;object-fit:cover;border-radius:6px;display:block;margin:0 auto;" />`
              : '';

            const sku = it.sku ? String(it.sku) : '';
            const price = it.price != null && it.price !== '' ? Number(it.price) : null;
            const priceText = price != null && !Number.isNaN(price) ? formatPrice(price) : '';
            const lineTotal = price != null && !Number.isNaN(price) ? price * it.quantity : null;
            const lineTotalText = lineTotal != null ? formatPrice(lineTotal) : '';

            const bgColor = idx % 2 === 0 ? '#ffffff' : 'rgba(var(--color-foreground), 0.03)';

            return `
              <tr style="background:${bgColor}; display: table-row !important;">
                <td style="padding:0.75rem 0.5rem; width:80px; text-align:center; vertical-align:middle; display: table-cell !important;">${img}</td>
                <td style="padding:0.75rem 0.5rem; vertical-align:middle; display: table-cell !important;">
                  <div style="font-weight:600;">${link}</div>
                </td>
                <td style="padding:0.75rem 0.5rem; text-align:right; white-space:nowrap; vertical-align:middle; display: table-cell !important;font-size:14px;color:rgba(var(--color-foreground), 0.75);">${sku}</td>
                <td style="padding:0.75rem 0.5rem; text-align:right; white-space:nowrap; vertical-align:middle; display: table-cell !important;font-size:14px;color:rgba(var(--color-foreground), 0.75);">${priceText}</td>
                <td style="padding:0.75rem 0.5rem; text-align:right; white-space:nowrap; vertical-align:middle; display: table-cell !important;font-size:14px;color:rgba(var(--color-foreground), 0.75);">${formatNumber(it.quantity)}</td>
                <td style="padding:0.75rem 0.5rem; text-align:right; white-space:nowrap; vertical-align:middle; display: table-cell !important;font-size:14px;font-weight:600;">${lineTotalText}</td>
              </tr>
            `;
          })
          .join('');

        const extraCount = (q.items || []).length - items.length;
        const extraHtml = extraCount > 0 ? `<div style="padding:1rem;background:rgba(var(--color-foreground), 0.03);text-align:center;opacity:0.8;">+${extraCount} more item(s)</div>` : '';

        return `
          <div class="quote-history__item" style="margin-bottom: 2rem;">
            <div style="background:#ffffff; border: 1px solid rgba(var(--color-foreground), 0.12); border-radius: 12px; overflow:hidden;">
              <div style="padding: 1rem; border-bottom: 1px solid rgba(var(--color-foreground), 0.12);">
                <div style="display:flex; justify-content:space-between; gap: 1rem; flex-wrap:wrap; align-items:baseline;">
                  <div style="font-weight:700;">
                    <a href="/pages/quote-details?quoteId=${encodeURIComponent(q.id)}" style="color:#111827; text-decoration:none;">Quote #QT-${q.quoteNumber}</a>
                  </div>
                  <a href="/pages/quote-details?quoteId=${encodeURIComponent(q.id)}" style="color:#111827;">View</a>
                </div>
              </div>
              <div style="overflow-x: auto; -webkit-overflow-scrolling: touch;">
                <table style="width:100% !important; min-width: 400px; border-collapse: collapse; display: table !important;">
                  <thead style="display: table-header-group !important;">
                    <tr style="text-align:left; border-bottom: 1px solid rgba(var(--color-foreground), 0.12); display: table-row !important;">
                      <th style="padding:0.5rem; display: table-cell !important;"></th>
                      <th style="padding:0.5rem; display: table-cell !important;">Item</th>
                      <th style="padding:0.5rem; text-align:right; display: table-cell !important;">SKU</th>
                      <th style="padding:0.5rem; text-align:right; display: table-cell !important;">Unit Price</th>
                      <th style="padding:0.5rem; text-align:right; display: table-cell !important;">Qty</th>
                      <th style="padding:0.5rem; text-align:right; display: table-cell !important;">Line Total</th>
                    </tr>
                  </thead>
                  <tbody style="display: table-row-group !important;">${itemsHtml}</tbody>
                </table>
              </div>
              ${extraHtml}
            </div>
          </div>
        `;
      })
      .join('');

    target.innerHTML = html;
  }

  function getQuotePageContainer() {
    return (
      document.querySelector('[data-quote-page]') ||
      document.querySelector('[data-quote-wishlist]')
    );
  }

  function getQuoteDetailsContainer() {
    return document.querySelector('[data-quote-details-page]');
  }

  function getQueryParam(name) {
    try {
      const u = new URL(window.location.href);
      return u.searchParams.get(name);
    } catch (_) {
      return null;
    }
  }

  function renderQuoteDetails(container, quote) {
    const target = container.querySelector('[data-quote-details]');
    if (!target) return;

    if (!quote) {
      target.innerHTML = '<p>Quote not found.</p>';
      return;
    }

    const rows = (quote.items || [])
      .map((it, idx) => {
        const title = `${it.title || ''}${it.variantTitle ? ` — ${it.variantTitle}` : ''}`;
        const link = it.productUrl ? `<a href="${it.productUrl}" style="color:#111827;text-decoration:underline;">${title}</a>` : title;
        const img = it.imageUrl
          ? `<img src="${it.imageUrl}" alt="" loading="lazy" style="width:100%;max-width:100px;height:auto;object-fit:contain;border-radius:6px;display:block;margin:0 auto;" />`
          : '';

        const sku = it.sku ? String(it.sku) : '';
        const price = it.price != null && it.price !== '' ? Number(it.price) : null;
        let priceDisplay = '';
        if (price != null && !Number.isNaN(price)) {
          const lineTotal = price * it.quantity;
          priceDisplay = `<div style="line-height:1.4;">${formatPrice(price)} × ${formatNumber(it.quantity)}<br/><strong>${formatPrice(lineTotal)}</strong></div>`;
        }

        const bgColor = idx % 2 === 0 ? '#ffffff' : 'rgba(var(--color-foreground), 0.03)';

        return `
          <tr style="background:${bgColor}; display: table-row !important;">
            <td style="padding:0.75rem 0.5rem; width:80px; text-align:center; vertical-align:middle; display: table-cell !important;">${img}</td>
            <td style="padding:0.75rem 0.5rem; vertical-align:middle; display: table-cell !important;">
              <div style="font-weight:600;">${link}</div>
            </td>
            <td style="padding:0.75rem 0.5rem; white-space:nowrap; vertical-align:middle; display: table-cell !important;">${sku}</td>
            <td style="padding:0.75rem 0.5rem; text-align:right; vertical-align:middle; display: table-cell !important;">${priceDisplay}</td>
            <td style="padding:0.75rem 0.5rem; text-align:right; white-space:nowrap; vertical-align:middle; display: table-cell !important;">${formatNumber(it.quantity)}</td>
          </tr>
        `;
      })
      .join('');

    const metaHtml = `
      <div style="max-width: 920px; margin: 0 auto;">
        <div style="background:#ffffff; border: 1px solid rgba(var(--color-foreground), 0.12); border-radius: 12px; overflow:hidden;">
          <div style="background:#7b0303; color:#ffffff; padding: 0.9rem 1rem;">
            <div style="display:flex; justify-content:space-between; gap: 1rem; flex-wrap:wrap; align-items:baseline;">
              <div style="font-weight:800;">Quote #QT-${quote.quoteNumber}</div>
              <div style="opacity:0.95;">${new Date(quote.createdAt).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: '2-digit',
              })}</div>
            </div>
          </div>
          <div style="padding: 1rem;">
            ${quote.status ? `<div style="margin-top:0.25rem;"><strong>Status:</strong> ${quote.status}</div>` : ''}
            ${quote.note ? `<div style="margin-top:0.5rem;"><strong>Notes:</strong> ${quote.note}</div>` : ''}
            
            <div style="margin-top:0.5rem;"><strong>Total Items:</strong> ${formatNumber(quote.items?.length || 0)}</div>
            <div style="margin-top:0.5rem;"><strong>Total Quantity:</strong> ${formatNumber(quote.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0)}</div>
            <div style="margin-top:0.5rem;"><strong>Total Price:</strong> ${formatPrice(quote.items?.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 0)), 0) || 0)}</div>
          </div>
          <div style="height:4px; background:#95c45b;"></div>
        </div>
      </div>
    `;

    target.innerHTML = `
      ${metaHtml}
      <div style="margin-top: 1.5rem;">
        <div style="max-width: 920px; margin: 0 auto; overflow-x: auto; -webkit-overflow-scrolling: touch;">
          <table style="width:100% !important; min-width: 600px; border-collapse: collapse; border: 1px solid #ccc; display: table !important;">
          <thead style="display: table-header-group !important;">
            <tr style="text-align:left; border-bottom: 1px solid rgba(var(--color-foreground), 0.12); display: table-row !important;">
              <th style="padding:0.5rem; display: table-cell !important;"></th>
              <th style="padding:0.5rem; display: table-cell !important;">Item</th>
              <th style="padding:0.5rem; display: table-cell !important;">SKU</th>
              <th style="padding:0.5rem; text-align:right; display: table-cell !important;">Price</th>
              <th style="padding:0.5rem; text-align:right; display: table-cell !important;">Qty</th>
            </tr>
          </thead>
          <tbody style="display: table-row-group !important;">${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  async function initQuotePage() {
    const container = getQuotePageContainer();
    if (!container) return;

    const config = getConfig();
    if (!config || !config.customerId) return;

    try {
      const history = await loadHistory(config);
      renderHistory(container, history.quotes || []);
    } catch (e) {
      renderHistory(container, []);
    }

    const submitBtn = container.querySelector('[data-quote-submit]');
    if (!submitBtn) return;

    submitBtn.addEventListener('click', async (evt) => {
      evt.preventDefault();

      const noteEl = container.querySelector('[data-quote-note]');
      const note = noteEl ? noteEl.value : '';

      try {
        setSubmitting(container, true);
        showMessage(container, 'error', '');
        await submitQuote({ ...config, note });
        await clearCart();
        window.location.href = '/pages/quotes?submitted=1';
      } catch (e) {
        const msg = e && e.message ? e.message : 'Failed to submit quote.';
        showMessage(container, 'error', msg);
      } finally {
        setSubmitting(container, false);
      }
    });
  }

  async function initQuoteDetailsPage() {
    const container = getQuoteDetailsContainer();
    if (!container) return;

    const config = getConfig();
    if (!config || !config.customerId) return;

    const quoteId = getQueryParam('quoteId');
    if (!quoteId) {
      renderQuoteDetails(container, null);
      return;
    }

    let currentQuote = null;

    try {
      const data = await loadQuoteById({ ...config, quoteId });
      currentQuote = data.quote || null;
      renderQuoteDetails(container, currentQuote);
    } catch (e) {
      renderQuoteDetails(container, null);
    }

    const printBtn = container.querySelector('[data-print-quote]');
    if (printBtn && currentQuote) {
      printBtn.addEventListener('click', () => {
        printQuote(currentQuote, config);
      });
    }
  }

  async function printQuote(quote, config) {
    if (!quote) return;

    const itemRows = (quote.items || [])
      .map((it, idx) => {
        const title = `${it.title || ''}${it.variantTitle ? ` — ${it.variantTitle}` : ''}`;
        const sku = it.sku ? String(it.sku) : '';
        const price = it.price != null && it.price !== '' ? Number(it.price) : null;
        const priceText = price != null && !Number.isNaN(price) ? formatPrice(price) : '';
        const lineTotal = price != null && !Number.isNaN(price) ? price * it.quantity : null;
        const lineTotalText = lineTotal != null ? formatPrice(lineTotal) : '';
        const bgColor = idx % 2 === 0 ? '#ffffff' : '#f9f9f9';

        return `
          <tr style="background:${bgColor};">
            <td style="padding:12px 8px; border-bottom:1px solid #eee;">${title}</td>
            <td style="padding:12px 8px; border-bottom:1px solid #eee; text-align:center;">${sku}</td>
            <td style="padding:12px 8px; border-bottom:1px solid #eee; text-align:center;">${priceText}</td>
            <td style="padding:12px 8px; border-bottom:1px solid #eee; text-align:center;">${formatNumber(it.quantity)}</td>
            <td style="padding:12px 8px; border-bottom:1px solid #eee; text-align:right; font-weight:600;">${lineTotalText}</td>
          </tr>
        `;
      })
      .join('');

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 900px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #7b0303 0%, #600202 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; margin-bottom: 0; display: flex; justify-content: space-between; align-items: center;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom: 20px;">
            <div>
              <h1 style="font-size: 28px; margin-bottom: 8px; margin-top: 0; color: #ffffff;">Quote Request</h1>
              <p style="opacity: 0.95; font-size: 14px; margin: 0; color: #ffffff;">Quote #QT-${quote.quoteNumber}</p>
            </div>
            <img src="https://cdn.shopify.com/s/files/1/0623/8794/5569/files/logo.png?v=1771950005" alt="Jim Ray" style="height: 50px; filter: brightness(0) invert(1);" />
          </div>
          <div style="height: 6px; background: #ececec; margin-bottom: 30px;"></div>

          <div style="background: #f9f9f9; padding: 20px; border-radius: 6px; margin-bottom: 30px; border: 1px solid #e0e0e0;">
            <h2 style="font-size: 16px; color: #7b0303; margin-bottom: 12px; margin-top: 0; text-transform: uppercase; letter-spacing: 0.5px;">Quote Information</h2>
            <div style="display: flex; margin-bottom: 8px;">
              <div style="font-weight: 600; min-width: 140px; color: #666;">Quote #:</div>
              <div style="color: #333;">QT-${quote.quoteNumber}</div>
            </div>
            <div style="display: flex; margin-bottom: 8px;">
              <div style="font-weight: 600; min-width: 140px; color: #666;">Date Submitted:</div>
              <div style="color: #333;">${new Date(quote.createdAt).toLocaleString()}</div>
            </div>
            <div style="display: flex; margin-bottom: 8px;">
              <div style="font-weight: 600; min-width: 140px; color: #666;">Status:</div>
              <div style="color: #333;">${quote.status || 'Pending'}</div>
            </div>
            ${quote.note ? `
            <div style="display: flex; margin-bottom: 8px;">
              <div style="font-weight: 600; min-width: 140px; color: #666;">Notes:</div>
              <div style="color: #333;">${quote.note}</div>
            </div>
            ` : ''}
          </div>
          <div style="display: flex; margin-bottom: 8px;">
            <div style="font-weight: 600; min-width: 140px; color: #666;">Date Submitted:</div>
            <div style="color: #333;">${new Date(quote.createdAt).toLocaleString()}</div>
          </div>
          <div style="display: flex; margin-bottom: 8px;">
            <div style="font-weight: 600; min-width: 140px; color: #666;">Status:</div>
            <div style="color: #333;">${quote.status || 'Pending'}</div>
          </div>
          ${quote.note ? `
          <div style="display: flex; margin-bottom: 8px;">
            <div style="font-weight: 600; min-width: 140px; color: #666;">Notes:</div>
            <div style="color: #333;">${quote.note}</div>
          </div>
          ` : ''}
        </div>

        <div style="background: #f9f9f9; padding: 20px; border-radius: 6px; margin-bottom: 30px; border: 1px solid #e0e0e0;">
          <h2 style="font-size: 16px; color: #7b0303; margin-bottom: 12px; margin-top: 0; text-transform: uppercase; letter-spacing: 0.5px;">Customer Information</h2>
          <div style="display: flex; margin-bottom: 8px;">
            <div style="font-weight: 600; min-width: 140px; color: #666;">Customer ID:</div>
            <div style="color: #333;">${quote.shopifyCustomerId || config.customerId || 'N/A'}</div>
          </div>
          <div style="display: flex; margin-bottom: 8px;">
            <div style="font-weight: 600; min-width: 140px; color: #666;">Email:</div>
            <div style="color: #333;">${quote.customerEmail || config.customerEmail || 'N/A'}</div>
          </div>
          ${quote.customerName ? `
          <div style="display: flex; margin-bottom: 8px;">
            <div style="font-weight: 600; min-width: 140px; color: #666;">Name:</div>
            <div style="color: #333;">${quote.customerName}</div>
          </div>
          ` : ''}
        </div>

        <h2 style="margin-bottom: 16px; color: #7b0303; font-size: 18px; margin-top: 0;">Items Requested</h2>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px; border: 1px solid #ddd; border-radius: 6px; overflow: hidden;">
          <thead style="background: #7b0303; color: white;">
            <tr>
              <th style="padding: 14px 8px; text-align: left; font-weight: 600; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Product</th>
              <th style="padding: 14px 8px; text-align: center; font-weight: 600; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">SKU</th>
              <th style="padding: 14px 8px; text-align: center; font-weight: 600; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Unit Price</th>
              <th style="padding: 14px 8px; text-align: center; font-weight: 600; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Quantity</th>
              <th style="padding: 14px 8px; text-align: right; font-weight: 600; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Line Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
          </tbody>
        </table>

        <div style="background: #f0f0f0; padding: 15px; border-radius: 6px; margin-bottom: 30px; text-align: right;">
          <div style="font-weight: 600; font-size: 16px; color: #7b0303;">Total Quantity: ${formatNumber(quote.items.reduce((sum, item) => sum + item.quantity, 0))}</div>
          <div style="font-weight: 600; font-size: 18px; color: #7b0303; margin-top: 5px;">Total Price: ${formatPrice(quote.items.reduce((sum, item) => sum + (item.price * item.quantity), 0))}</div>
        </div>

        <div style="text-align: center; padding-top: 30px; border-top: 2px solid #ececec; color: #666; font-size: 13px;">
          <p style="margin-bottom: 8px;"><strong>Thank you for your quote request!</strong></p>
          <p style="margin-bottom: 8px;">We will review your request and contact you shortly. If you have any questions, feel free to reach out to us at <b>info@jimray.com</b>.</p>
          <p style="margin-top: 16px; color: #7b0303; font-weight: 600; margin-bottom: 0;">Jim Ray</p>
        </div>
      </div>
    `;

    if (!window.html2pdf) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      script.onload = () => {
        generatePDF(htmlContent, quote.quoteNumber);
      };
      document.head.appendChild(script);
    } else {
      generatePDF(htmlContent, quote.quoteNumber);
    }
  }

  function generatePDF(htmlContent, quoteNumber) {
    const element = document.createElement('div');
    element.innerHTML = htmlContent;
    element.style.padding = '20px';

    const opt = {
      margin: 10,
      filename: `quote-QT-${quoteNumber}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save();
  }

  async function initCartSubmit() {
    const container = document.querySelector('[data-quote-cart-submit]');
    if (!container) return;

    const config = getConfig();
    if (!config || !config.customerId) return;

    const submitBtn = container.querySelector('[data-quote-submit]');
    if (!submitBtn) return;

    submitBtn.addEventListener('click', async (evt) => {
      evt.preventDefault();

      const noteEl = container.querySelector('[data-quote-note]');
      const note = noteEl ? noteEl.value : '';

      try {
        setSubmitting(container, true);
        showMessage(container, 'error', '');
        const result = await submitQuote({ ...config, note });
        await clearCart();
        
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        if (result && result.quoteId) {
          window.location.href = `/pages/quote-details?quoteId=${encodeURIComponent(result.quoteId)}`;
        } else {
          window.location.href = '/pages/quotes?submitted=1';
        }
      } catch (e) {
        const msg = e && e.message ? e.message : 'Failed to submit quote.';
        showMessage(container, 'error', msg);
      } finally {
        setSubmitting(container, false);
      }
    });
  }

  async function initAccountLatestQuotes() {
    const container = document.querySelector('[data-quote-account]');
    if (!container) return;

    const config = getConfig();
    if (!config || !config.customerId) return;

    try {
      const history = await loadHistory(config);
      renderLatestHistory(container, history.quotes || []);
    } catch (e) {
      renderLatestHistory(container, []);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    initQuotePage();
    initCartSubmit();
    initAccountLatestQuotes();
    initQuoteDetailsPage();
  });
})();
