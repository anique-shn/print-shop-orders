'use client';

import { formatCurrency, formatDate, PAYMENT_TERMS, calcSubtotal, calcDiscount, calcTax, INVOICE_STATUSES } from '@/lib/utils';
import type { CompanySettings } from '@/types/database';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface InvoicePreviewProps {
  layout: 'classic' | 'modern' | 'minimal' | 'compact';
  company: Partial<CompanySettings>;
  invoice: {
    invoice_number: string;
    issue_date: string;
    due_date?: string | null;
    payment_terms: string;
    status: string;
    customer_name?: string | null;
    customer_email?: string | null;
    customer_company?: string | null;
    customer_address?: string | null;
    notes?: string | null;
    terms?: string | null;
    discount_type: 'percent' | 'flat';
    discount_value: number;
    tax_rate: number;
  };
  items: { description: string; qty: number; rate: number; taxable: boolean }[];
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function calcTotals(items: InvoicePreviewProps['items'], invoice: InvoicePreviewProps['invoice']) {
  const sub = calcSubtotal(items.map((i) => ({ qty: i.qty, unit_price: i.rate })));
  const disc = calcDiscount(sub, invoice.discount_type, invoice.discount_value);
  const tax = calcTax(sub - disc, invoice.tax_rate);
  const total = sub - disc + tax;
  return { sub, disc, tax, total };
}

function payTermLabel(value: string) {
  return PAYMENT_TERMS.find((t) => t.value === value)?.label ?? value;
}

function StatusPill({ status }: { status: string }) {
  const def = INVOICE_STATUSES.find((s) => s.value === status);
  const colors: Record<string, { bg: string; text: string }> = {
    draft:     { bg: '#E2E8F0', text: '#475569' },
    sent:      { bg: '#DBEAFE', text: '#1E40AF' },
    paid:      { bg: '#D1FAE5', text: '#065F46' },
    overdue:   { bg: '#FEE2E2', text: '#991B1B' },
    cancelled: { bg: '#F1F5F9', text: '#64748B' },
  };
  const c = colors[status] ?? colors.draft;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        backgroundColor: c.bg,
        color: c.text,
        letterSpacing: '0.03em',
      }}
    >
      {def?.label ?? status}
    </span>
  );
}

// ── Layout: Classic ───────────────────────────────────────────────────────────

function ClassicLayout({ company, invoice, items }: InvoicePreviewProps) {
  const primaryColor = company.primary_color ?? '#05253D';
  const accentColor = company.accent_color ?? '#2E7CF6';
  const { sub, disc, tax, total } = calcTotals(items, invoice);
  const termLabel = payTermLabel(invoice.payment_terms);

  return (
    <div style={{ backgroundColor: 'white', minHeight: 1000, fontFamily: 'Inter, sans-serif', fontSize: 13 }}>
      {/* Navy header band */}
      <div style={{ backgroundColor: primaryColor, padding: '32px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            {company.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.logo_url} alt="Logo" style={{ height: 40, marginBottom: 12, objectFit: 'contain' }} />
            )}
            <div style={{ color: 'white', fontWeight: 700, fontSize: 20 }}>{company.name ?? 'Your Print Shop'}</div>
            {(company.address || company.city) && (
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 4 }}>
                {[company.address, company.city, company.state, company.zip].filter(Boolean).join(', ')}
              </div>
            )}
            {company.phone && <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>{company.phone}</div>}
            {company.email && <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>{company.email}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Invoice</div>
            <div style={{ color: 'white', fontFamily: 'monospace', fontSize: 28, fontWeight: 800 }}>{invoice.invoice_number}</div>
            <div style={{ marginTop: 8 }}>
              <StatusPill status={invoice.status} />
            </div>
          </div>
        </div>
      </div>

      {/* Meta band */}
      <div style={{ backgroundColor: '#F1F5F9', padding: '12px 40px', display: 'flex', gap: 40 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B', marginBottom: 2 }}>Issue Date</div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{formatDate(invoice.issue_date)}</div>
        </div>
        {invoice.due_date && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B', marginBottom: 2 }}>Due Date</div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{formatDate(invoice.due_date)}</div>
          </div>
        )}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B', marginBottom: 2 }}>Payment Terms</div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{termLabel}</div>
        </div>
        {company.tax_number && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B', marginBottom: 2 }}>Tax ID</div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{company.tax_number}</div>
          </div>
        )}
      </div>

      {/* Bill From / Bill To */}
      <div style={{ padding: '24px 40px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, borderBottom: '1px solid #E2E8F0' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B', marginBottom: 6 }}>Bill From</div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{company.name ?? '—'}</div>
          {company.address && <div style={{ color: '#64748B', fontSize: 12, marginTop: 2 }}>{company.address}</div>}
          {(company.city || company.state) && (
            <div style={{ color: '#64748B', fontSize: 12 }}>{[company.city, company.state, company.zip].filter(Boolean).join(', ')}</div>
          )}
          {company.email && <div style={{ color: '#64748B', fontSize: 12 }}>{company.email}</div>}
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B', marginBottom: 6 }}>Bill To</div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{invoice.customer_name ?? '—'}</div>
          {invoice.customer_company && <div style={{ color: '#64748B', fontSize: 12, marginTop: 2 }}>{invoice.customer_company}</div>}
          {invoice.customer_email && <div style={{ color: '#64748B', fontSize: 12 }}>{invoice.customer_email}</div>}
          {invoice.customer_address && <div style={{ color: '#64748B', fontSize: 12, marginTop: 2 }}>{invoice.customer_address}</div>}
        </div>
      </div>

      {/* Line items table */}
      <div style={{ padding: '24px 40px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ backgroundColor: primaryColor }}>
              {['Description', 'Qty', 'Rate', 'Amount'].map((h, i) => (
                <th key={h} style={{
                  padding: '10px 14px',
                  textAlign: i === 0 ? 'left' : 'right',
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'white',
                  width: i === 0 ? undefined : i === 1 ? 48 : 90,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} style={{ backgroundColor: i % 2 === 0 ? 'white' : '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                <td style={{ padding: '10px 14px', fontWeight: 500 }}>{item.description}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', color: '#475569' }}>{item.qty}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', color: '#475569' }}>{formatCurrency(item.rate)}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(item.qty * item.rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div style={{ padding: '0 40px 24px', display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ width: 280 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
            <span style={{ color: '#64748B' }}>Subtotal</span>
            <span style={{ fontWeight: 500 }}>{formatCurrency(sub)}</span>
          </div>
          {disc > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
              <span style={{ color: '#64748B' }}>Discount ({invoice.discount_type === 'percent' ? `${invoice.discount_value}%` : 'flat'})</span>
              <span style={{ color: '#DC2626', fontWeight: 500 }}>-{formatCurrency(disc)}</span>
            </div>
          )}
          {invoice.tax_rate > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
              <span style={{ color: '#64748B' }}>Tax ({invoice.tax_rate}%)</span>
              <span style={{ fontWeight: 500 }}>{formatCurrency(tax)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: '2px solid #E2E8F0', marginTop: 4 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>Total Due</span>
            <span style={{ fontWeight: 800, fontSize: 20, color: accentColor }}>{formatCurrency(total)}</span>
          </div>
        </div>
      </div>

      {/* Notes & Terms */}
      {(invoice.notes || invoice.terms) && (
        <div style={{ padding: '20px 40px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, borderTop: '1px solid #E2E8F0' }}>
          {invoice.notes && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B', marginBottom: 6 }}>Notes</div>
              <div style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{invoice.notes}</div>
            </div>
          )}
          {invoice.terms && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B', marginBottom: 6 }}>Terms &amp; Conditions</div>
              <div style={{ fontSize: 12, whiteSpace: 'pre-wrap', color: '#64748B' }}>{invoice.terms}</div>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{ padding: '16px 40px', borderTop: '1px solid #E2E8F0', textAlign: 'center', fontSize: 11, color: '#94A3B8' }}>
        {company.website && <div style={{ marginBottom: 2 }}>{company.website}</div>}
        {company.email_footer
          ? <div>{company.email_footer}</div>
          : <div>Thank you for your business — {company.email ?? 'contact us for questions'}</div>
        }
      </div>
    </div>
  );
}

// ── Layout: Modern ────────────────────────────────────────────────────────────

function ModernLayout({ company, invoice, items }: InvoicePreviewProps) {
  const accentColor = company.accent_color ?? '#2E7CF6';
  const primaryColor = company.primary_color ?? '#05253D';
  const { sub, disc, tax, total } = calcTotals(items, invoice);
  const termLabel = payTermLabel(invoice.payment_terms);

  return (
    <div style={{ backgroundColor: 'white', minHeight: 1000, fontFamily: 'Inter, sans-serif', fontSize: 13, display: 'flex' }}>
      {/* Left accent strip */}
      <div style={{ width: 10, backgroundColor: accentColor, flexShrink: 0 }} />

      {/* Main content */}
      <div style={{ flex: 1, padding: '32px 40px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
          <div>
            {company.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.logo_url} alt="Logo" style={{ height: 32, marginBottom: 8, objectFit: 'contain' }} />
            )}
            <div style={{ fontWeight: 800, fontSize: 18, color: primaryColor }}>{company.name ?? 'Your Print Shop'}</div>
            {company.email && <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{company.email}</div>}
            {company.website && <div style={{ fontSize: 12, color: '#64748B' }}>{company.website}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'monospace', fontSize: 26, fontWeight: 800, color: accentColor }}>{invoice.invoice_number}</div>
            <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>Issued {formatDate(invoice.issue_date)}</div>
            {invoice.due_date && <div style={{ fontSize: 11, color: '#64748B' }}>Due {formatDate(invoice.due_date)}</div>}
            <div style={{ marginTop: 6 }}><StatusPill status={invoice.status} /></div>
          </div>
        </div>

        {/* Bill To card */}
        <div style={{ border: '1px solid #E2E8F0', borderRadius: 10, padding: '14px 18px', marginBottom: 20, backgroundColor: '#F8FAFC' }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B', marginBottom: 6 }}>Bill To</div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{invoice.customer_name ?? '—'}</div>
          {invoice.customer_company && <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{invoice.customer_company}</div>}
          {invoice.customer_email && <div style={{ fontSize: 12, color: '#64748B' }}>{invoice.customer_email}</div>}
          {invoice.customer_address && <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{invoice.customer_address}</div>}
        </div>

        {/* Meta strip */}
        <div style={{ display: 'flex', gap: 28, marginBottom: 24, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B', marginBottom: 2 }}>Terms</div>
            <div style={{ fontWeight: 600 }}>{termLabel}</div>
          </div>
          {company.tax_number && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B', marginBottom: 2 }}>Tax ID</div>
              <div style={{ fontWeight: 600 }}>{company.tax_number}</div>
            </div>
          )}
        </div>

        {/* Column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 3rem 6rem 6rem', gap: 12, padding: '6px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B', marginBottom: 6 }}>
          <span>Description</span><span style={{ textAlign: 'center' }}>Qty</span><span style={{ textAlign: 'right' }}>Rate</span><span style={{ textAlign: 'right' }}>Amount</span>
        </div>

        {/* Item rows */}
        <div style={{ marginBottom: 24 }}>
          {items.map((item, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 3rem 6rem 6rem', gap: 12, alignItems: 'center', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', marginBottom: 6, fontSize: 13 }}>
              <span style={{ fontWeight: 500 }}>{item.description}</span>
              <span style={{ textAlign: 'center', color: '#64748B' }}>{item.qty}</span>
              <span style={{ textAlign: 'right', color: '#64748B' }}>{formatCurrency(item.rate)}</span>
              <span style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrency(item.qty * item.rate)}</span>
            </div>
          ))}
        </div>

        {/* Totals block with accent bg */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
          <div style={{ width: 280, borderRadius: 12, overflow: 'hidden', backgroundColor: primaryColor }}>
            <div style={{ padding: '18px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
                <span>Subtotal</span><span>{formatCurrency(sub)}</span>
              </div>
              {disc > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
                  <span>Discount</span><span style={{ color: '#FCA5A5' }}>-{formatCurrency(disc)}</span>
                </div>
              )}
              {invoice.tax_rate > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
                  <span>Tax ({invoice.tax_rate}%)</span><span>{formatCurrency(tax)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.2)', marginTop: 4 }}>
                <span style={{ color: 'white', fontWeight: 700, fontSize: 15 }}>Total Due</span>
                <span style={{ color: 'white', fontWeight: 800, fontSize: 22 }}>{formatCurrency(total)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Notes & Terms */}
        {(invoice.notes || invoice.terms) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, borderTop: '1px solid #E2E8F0', paddingTop: 20 }}>
            {invoice.notes && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B', marginBottom: 6 }}>Notes</div>
                <div style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{invoice.notes}</div>
              </div>
            )}
            {invoice.terms && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B', marginBottom: 6 }}>Terms</div>
                <div style={{ fontSize: 12, whiteSpace: 'pre-wrap', color: '#64748B' }}>{invoice.terms}</div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 24, paddingTop: 14, borderTop: '1px solid #E2E8F0', fontSize: 11, color: '#94A3B8' }}>
          {company.email_footer
            ? <span>{company.email_footer}</span>
            : <span>Thank you for your business.{company.email ? ` Questions? ${company.email}` : ''}</span>
          }
        </div>
      </div>
    </div>
  );
}

// ── Layout: Minimal ───────────────────────────────────────────────────────────

function MinimalLayout({ company, invoice, items }: InvoicePreviewProps) {
  const { sub, disc, tax, total } = calcTotals(items, invoice);
  const termLabel = payTermLabel(invoice.payment_terms);

  return (
    <div style={{ backgroundColor: 'white', minHeight: 1000, fontFamily: 'Inter, sans-serif', fontSize: 13, padding: '48px 56px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 40 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 17 }}>{company.name ?? 'Your Print Shop'}</div>
          {company.address && (
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
              {[company.address, company.city, company.state].filter(Boolean).join(', ')}
            </div>
          )}
          {company.email && <div style={{ fontSize: 12, color: '#64748B' }}>{company.email}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 22 }}>{invoice.invoice_number}</div>
          <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>Invoice</div>
        </div>
      </div>

      {/* Bill to + dates */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 32, marginBottom: 40, paddingBottom: 32, borderBottom: '2px solid #0F172A' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B', marginBottom: 6 }}>Bill To</div>
          <div style={{ fontWeight: 600 }}>{invoice.customer_name ?? '—'}</div>
          {invoice.customer_company && <div style={{ fontSize: 12, color: '#64748B' }}>{invoice.customer_company}</div>}
          {invoice.customer_email && <div style={{ fontSize: 12, color: '#64748B' }}>{invoice.customer_email}</div>}
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B', marginBottom: 6 }}>Issue Date</div>
          <div style={{ fontWeight: 600 }}>{formatDate(invoice.issue_date)}</div>
          {invoice.due_date && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B', marginTop: 12, marginBottom: 4 }}>Due Date</div>
              <div style={{ fontWeight: 600 }}>{formatDate(invoice.due_date)}</div>
            </>
          )}
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B', marginBottom: 6 }}>Payment Terms</div>
          <div style={{ fontWeight: 600 }}>{termLabel}</div>
          <div style={{ marginTop: 8 }}><StatusPill status={invoice.status} /></div>
        </div>
      </div>

      {/* Line items */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 32 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #0F172A' }}>
            {['Description', 'Qty', 'Rate', 'Amount'].map((h, i) => (
              <th key={h} style={{
                paddingBottom: 10,
                textAlign: i === 0 ? 'left' : 'right',
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: '#475569',
                width: i === 0 ? undefined : i === 1 ? 48 : 90,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #E2E8F0' }}>
              <td style={{ padding: '10px 0', fontWeight: 500 }}>{item.description}</td>
              <td style={{ padding: '10px 0', textAlign: 'right', color: '#64748B' }}>{item.qty}</td>
              <td style={{ padding: '10px 0', textAlign: 'right', color: '#64748B' }}>{formatCurrency(item.rate)}</td>
              <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(item.qty * item.rate)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 40 }}>
        <div style={{ width: 260 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
            <span style={{ color: '#64748B' }}>Subtotal</span><span>{formatCurrency(sub)}</span>
          </div>
          {disc > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
              <span style={{ color: '#64748B' }}>Discount</span><span>-{formatCurrency(disc)}</span>
            </div>
          )}
          {invoice.tax_rate > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
              <span style={{ color: '#64748B' }}>Tax ({invoice.tax_rate}%)</span><span>{formatCurrency(tax)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15, paddingTop: 12, borderTop: '2px solid #0F172A', marginTop: 4 }}>
            <span>Total Due</span><span>{formatCurrency(total)}</span>
          </div>
        </div>
      </div>

      {/* Notes & Terms */}
      {(invoice.notes || invoice.terms) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, borderTop: '1px solid #E2E8F0', paddingTop: 24 }}>
          {invoice.notes && (
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Notes</div>
              <div style={{ fontSize: 12, whiteSpace: 'pre-wrap', color: '#64748B' }}>{invoice.notes}</div>
            </div>
          )}
          {invoice.terms && (
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Terms &amp; Conditions</div>
              <div style={{ fontSize: 12, whiteSpace: 'pre-wrap', color: '#64748B' }}>{invoice.terms}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Layout: Compact ───────────────────────────────────────────────────────────

function CompactLayout({ company, invoice, items }: InvoicePreviewProps) {
  const primaryColor = company.primary_color ?? '#05253D';
  const { sub, disc, tax, total } = calcTotals(items, invoice);
  const termLabel = payTermLabel(invoice.payment_terms);

  return (
    <div style={{ backgroundColor: 'white', minHeight: 800, fontFamily: 'Inter, sans-serif', fontSize: 11, padding: '28px 36px' }}>
      {/* Compact header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, paddingBottom: 14, borderBottom: `2px solid ${primaryColor}` }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: primaryColor }}>{company.name ?? 'Your Print Shop'}</div>
          <div style={{ fontSize: 10, color: '#64748B' }}>
            {[company.address, company.city, company.state, company.zip].filter(Boolean).join(', ')}
          </div>
          {company.email && <div style={{ fontSize: 10, color: '#64748B' }}>{company.email}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 16, color: primaryColor }}>{invoice.invoice_number}</div>
          <div style={{ fontSize: 10, color: '#64748B' }}>
            Issued: {formatDate(invoice.issue_date)}{invoice.due_date ? ` · Due: ${formatDate(invoice.due_date)}` : ''} · {termLabel}
          </div>
          <div style={{ marginTop: 4 }}><StatusPill status={invoice.status} /></div>
        </div>
      </div>

      {/* Customer + meta on one line */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 16, fontSize: 11 }}>
        <div>
          <span style={{ fontWeight: 600, color: '#64748B', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>To: </span>
          <span style={{ fontWeight: 600 }}>{invoice.customer_name ?? '—'}</span>
          {invoice.customer_company && <span style={{ color: '#64748B' }}> · {invoice.customer_company}</span>}
          {invoice.customer_email && <span style={{ color: '#64748B' }}> · {invoice.customer_email}</span>}
        </div>
      </div>

      {/* Compact table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 16 }}>
        <thead>
          <tr style={{ backgroundColor: '#F1F5F9' }}>
            {['Description', 'Qty', 'Rate', 'Amount'].map((h, i) => (
              <th key={h} style={{
                padding: '5px 8px',
                textAlign: i === 0 ? 'left' : 'right',
                fontSize: 9,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: '#64748B',
                width: i === 0 ? undefined : i === 1 ? 40 : 72,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}>
              <td style={{ padding: '4px 8px' }}>{item.description}</td>
              <td style={{ padding: '4px 8px', textAlign: 'right', color: '#64748B' }}>{item.qty}</td>
              <td style={{ padding: '4px 8px', textAlign: 'right', color: '#64748B' }}>{formatCurrency(item.rate)}</td>
              <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(item.qty * item.rate)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Compact totals */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <div style={{ width: 200 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3, color: '#64748B' }}>
            <span>Subtotal</span><span style={{ color: '#0F172A' }}>{formatCurrency(sub)}</span>
          </div>
          {disc > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3, color: '#64748B' }}>
              <span>Discount</span><span style={{ color: '#DC2626' }}>-{formatCurrency(disc)}</span>
            </div>
          )}
          {invoice.tax_rate > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3, color: '#64748B' }}>
              <span>Tax ({invoice.tax_rate}%)</span><span style={{ color: '#0F172A' }}>{formatCurrency(tax)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 13, paddingTop: 6, borderTop: `2px solid ${primaryColor}`, marginTop: 2 }}>
            <span>Total</span><span style={{ color: primaryColor }}>{formatCurrency(total)}</span>
          </div>
        </div>
      </div>

      {/* Compact notes */}
      {(invoice.notes || invoice.terms) && (
        <div style={{ display: 'flex', gap: 24, fontSize: 10, color: '#64748B', borderTop: '1px solid #E2E8F0', paddingTop: 12 }}>
          {invoice.notes && <div style={{ flex: 1 }}><strong>Notes:</strong> {invoice.notes}</div>}
          {invoice.terms && <div style={{ flex: 1 }}><strong>Terms:</strong> {invoice.terms}</div>}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function InvoicePreview(props: InvoicePreviewProps) {
  return (
    <div
      id="invoice-live-preview"
      style={{ width: 794, backgroundColor: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
    >
      {props.layout === 'classic' && <ClassicLayout {...props} />}
      {props.layout === 'modern'  && <ModernLayout  {...props} />}
      {props.layout === 'minimal' && <MinimalLayout {...props} />}
      {props.layout === 'compact' && <CompactLayout {...props} />}
    </div>
  );
}
