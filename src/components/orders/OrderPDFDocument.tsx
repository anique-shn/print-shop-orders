'use client';

import type { Order, OrderItem, OrderItemDecoration, OrderItemFinishing, CompanySettings } from '@/types/database';
import { formatCurrency, formatDate, calcSubtotal, calcDiscount, calcTax, ORDER_STATUSES } from '@/lib/utils';

type RichItem = OrderItem & {
  order_item_decorations?: OrderItemDecoration[];
  order_item_finishing?: OrderItemFinishing[];
};
type OrderWithItems = Order & { order_items?: RichItem[] };

interface Props {
  order: OrderWithItems;
  company: Partial<CompanySettings>;
}

const PRIMARY = '#05253D';
const ACCENT  = '#2563EB';
const MUTED   = '#64748B';
const BORDER  = '#E2E8F0';
const BG_ALT  = '#F8FAFC';

function statusLabel(s: string) {
  return ORDER_STATUSES.find((x) => x.value === s)?.label ?? s;
}

function statusColor(s: string) {
  const map: Record<string, { bg: string; text: string }> = {
    inquiry:    { bg: '#FEF3C7', text: '#92400E' },
    new:        { bg: '#DBEAFE', text: '#1E40AF' },
    production: { bg: '#EDE9FE', text: '#5B21B6' },
    quality:    { bg: '#FEF9C3', text: '#854D0E' },
    ready:      { bg: '#D1FAE5', text: '#065F46' },
    shipped:    { bg: '#CFFAFE', text: '#164E63' },
    delivered:  { bg: '#D1FAE5', text: '#065F46' },
    cancelled:  { bg: '#FEE2E2', text: '#991B1B' },
  };
  return map[s] ?? { bg: '#F1F5F9', text: '#475569' };
}

const SIZE_ORDER = ['XS','S','M','L','XL','2XL','3XL','4XL','5XL'];

function sortedSizeEntries(matrix: Record<string, number> | null): [string, number][] {
  if (!matrix) return [];
  return Object.entries(matrix)
    .filter(([, q]) => q > 0)
    .sort(([a], [b]) => {
      const ai = SIZE_ORDER.indexOf(a), bi = SIZE_ORDER.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
}

function decoSummary(decos: OrderItemDecoration[]): string {
  return decos.map((d) => {
    const parts = [d.location, d.decoration_type];
    if (d.colors) parts.push(`${d.colors}c`);
    if (d.stitch_count) parts.push(`${(d.stitch_count / 1000).toFixed(0)}k sts`);
    return parts.filter(Boolean).join(' ');
  }).join(' · ');
}

function finishSummary(finishing: OrderItemFinishing[]): string {
  return finishing.map((f) => f.service_name).join(', ');
}

export function OrderPDFDocument({ order, company }: Props) {
  const richItems = (order.order_items ?? []) as RichItem[];
  const allLineItems = richItems.filter((i) => i.unit_price > 0 || i.line_type === 'garment');
  const garmentItems = allLineItems.filter((i) => i.line_type === 'garment');
  const otherItems   = allLineItems.filter((i) => i.line_type !== 'garment');

  const billable = richItems.filter((i) => i.unit_price > 0);
  const sub  = calcSubtotal(billable.map((i) => ({ qty: i.qty, unit_price: i.unit_price })));
  const disc = calcDiscount(sub, order.discount_type, order.discount_value);
  const tax  = calcTax(sub - disc, order.tax_rate);
  const total = sub - disc + tax;
  const balance = Math.max(0, total - (order.deposit_amount ?? 0));

  const sc = statusColor(order.status);
  const addr = [company.address, company.city, company.state, company.zip].filter(Boolean).join(', ');
  const totalPcs = garmentItems.reduce((s, i) => {
    const m = i.size_matrix as Record<string, number> | null;
    return s + (m ? Object.values(m).reduce((a, b) => a + b, 0) : i.qty);
  }, 0);

  return (
    <div
      id="order-pdf-document"
      style={{ width: 794, backgroundColor: 'white', fontFamily: 'Inter, -apple-system, sans-serif', fontSize: 11, color: '#0F172A' }}
    >
      {/* ── Header ── */}
      <div style={{ backgroundColor: PRIMARY, padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          {company.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={company.logo_url} alt="" style={{ height: 36, marginBottom: 6, objectFit: 'contain' }} />
          )}
          <p style={{ color: 'white', fontWeight: 700, fontSize: 16, margin: 0 }}>{company.name ?? 'Your Print Shop'}</p>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 9, margin: '2px 0 0' }}>
            {[addr, company.phone, company.email].filter(Boolean).join('  ·  ')}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 3 }}>Work Order</p>
          <p style={{ color: 'white', fontWeight: 800, fontSize: 22, fontFamily: 'monospace', margin: 0 }}>{order.order_number}</p>
          <span style={{ display: 'inline-block', marginTop: 5, padding: '2px 10px', borderRadius: 20, backgroundColor: sc.bg, color: sc.text, fontSize: 9, fontWeight: 700 }}>
            {statusLabel(order.status)}
          </span>
        </div>
      </div>

      {/* ── Info strip ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 0, borderBottom: `1px solid ${BORDER}`, backgroundColor: BG_ALT }}>
        {[
          { label: 'Customer', value: [order.customer_name, order.customer_company].filter(Boolean).join(' · ') || '—' },
          { label: 'Created',  value: formatDate(order.created_at) },
          { label: 'Due Date', value: order.due_date ? formatDate(order.due_date) : '—', red: !!order.due_date },
          { label: 'Total Pcs', value: `${totalPcs} pcs` },
        ].map(({ label, value, red }) => (
          <div key={label} style={{ padding: '8px 14px', borderRight: `1px solid ${BORDER}` }}>
            <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginBottom: 2 }}>{label}</p>
            <p style={{ fontSize: 10, fontWeight: 600, color: red ? '#DC2626' : '#0F172A', margin: 0 }}>{value}</p>
          </div>
        ))}
      </div>

      <div style={{ padding: '16px 32px' }}>

        {/* ── Garment line items table ── */}
        {garmentItems.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: MUTED, marginBottom: 6 }}>Line Items</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
              <thead>
                <tr style={{ backgroundColor: PRIMARY }}>
                  {['Item / Embellishments', 'Sizes', 'Pcs', 'Unit Price', 'Total'].map((h, i) => (
                    <th key={h} style={{
                      padding: '6px 8px',
                      textAlign: i === 0 ? 'left' : i === 1 ? 'left' : 'right',
                      fontSize: 8, fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: '0.07em',
                      color: 'rgba(255,255,255,0.8)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {garmentItems.map((item, idx) => {
                  const sizeMatrix = item.size_matrix as Record<string, number> | null;
                  const entries = sortedSizeEntries(sizeMatrix);
                  const pcs = entries.reduce((s, [, q]) => s + q, 0) || item.qty;
                  const decos = item.order_item_decorations ?? [];
                  const finishing = item.order_item_finishing ?? [];
                  const decoStr = decoSummary(decos);
                  const finStr = finishSummary(finishing);
                  const isEven = idx % 2 === 1;

                  return (
                    <tr key={item.id} style={{ backgroundColor: isEven ? BG_ALT : 'white', borderBottom: `1px solid ${BORDER}` }}>
                      {/* Description + embellishment summary */}
                      <td style={{ padding: '7px 8px', verticalAlign: 'top', maxWidth: 220 }}>
                        <p style={{ fontWeight: 700, color: '#0F172A', margin: 0, fontSize: 10 }}>{item.description}</p>
                        {item.color && (
                          <p style={{ fontSize: 9, color: MUTED, margin: '1px 0 0' }}>Color: {item.color}</p>
                        )}
                        {decoStr && (
                          <p style={{ fontSize: 8.5, color: ACCENT, margin: '2px 0 0', fontWeight: 500 }}>
                            🎨 {decoStr}
                          </p>
                        )}
                        {finStr && (
                          <p style={{ fontSize: 8.5, color: '#059669', margin: '1px 0 0', fontWeight: 500 }}>
                            ✂ {finStr}
                          </p>
                        )}
                        {item.price_overridden && (
                          <p style={{ fontSize: 8, color: '#B45309', margin: '2px 0 0', fontWeight: 600 }}>⚠ Price override{item.override_reason ? `: ${item.override_reason}` : ''}</p>
                        )}
                      </td>

                      {/* Size chips */}
                      <td style={{ padding: '7px 8px', verticalAlign: 'top' }}>
                        {entries.length > 0 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                            {entries.map(([sz, q]) => (
                              <span key={sz} style={{ backgroundColor: '#EFF6FF', color: '#1D4ED8', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3 }}>
                                {sz}<span style={{ color: '#93C5FD', fontWeight: 400 }}>×</span>{q}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: MUTED, fontSize: 9 }}>—</span>
                        )}
                      </td>

                      {/* Pcs */}
                      <td style={{ padding: '7px 8px', textAlign: 'right', verticalAlign: 'top', fontWeight: 600, fontSize: 10 }}>{pcs}</td>

                      {/* Unit price */}
                      <td style={{ padding: '7px 8px', textAlign: 'right', verticalAlign: 'top', color: MUTED, fontSize: 10 }}>{formatCurrency(item.unit_price)}</td>

                      {/* Line total */}
                      <td style={{ padding: '7px 8px', textAlign: 'right', verticalAlign: 'top', fontWeight: 700, color: PRIMARY, fontSize: 10 }}>
                        {formatCurrency(pcs * item.unit_price)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Other / Setup fees / Legacy items ── */}
        {otherItems.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: MUTED, marginBottom: 6 }}>
              {otherItems.some(i => i.line_type === 'setup_fee') ? 'Setup & Fees' : 'Additional Items'}
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
              <thead>
                <tr style={{ backgroundColor: '#FFF8EC', borderBottom: '1px solid #FDE68A' }}>
                  {['Description', 'Qty', 'Unit Price', 'Total'].map((h, i) => (
                    <th key={h} style={{ padding: '5px 8px', textAlign: i === 0 ? 'left' : 'right', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#92400E' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {otherItems.map((item, idx) => (
                  <tr key={item.id} style={{ borderBottom: idx < otherItems.length - 1 ? `1px solid ${BORDER}` : undefined, backgroundColor: idx % 2 === 1 ? BG_ALT : 'white' }}>
                    <td style={{ padding: '5px 8px' }}>{item.description}</td>
                    <td style={{ padding: '5px 8px', textAlign: 'right', color: MUTED }}>{item.qty}</td>
                    <td style={{ padding: '5px 8px', textAlign: 'right', color: MUTED }}>{formatCurrency(item.unit_price)}</td>
                    <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700, color: PRIMARY }}>{formatCurrency(item.qty * item.unit_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Totals + Notes side by side ── */}
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
          {/* Notes */}
          <div style={{ flex: 1 }}>
            {order.notes && (
              <div style={{ padding: '8px 12px', backgroundColor: BG_ALT, borderRadius: 6, border: `1px solid ${BORDER}` }}>
                <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginBottom: 4 }}>Notes</p>
                <p style={{ fontSize: 9.5, lineHeight: 1.6, color: '#334155', margin: 0 }}>{order.notes}</p>
              </div>
            )}
            {order.tracking_number && (
              <div style={{ marginTop: 8, padding: '6px 12px', backgroundColor: '#F0FDF4', borderRadius: 6, border: '1px solid #BBF7D0', fontSize: 9 }}>
                <span style={{ color: MUTED }}>Tracking: </span>
                <strong>{order.carrier ? `${order.carrier} — ` : ''}{order.tracking_number}</strong>
              </div>
            )}
          </div>

          {/* Totals */}
          <div style={{ width: 210, flexShrink: 0 }}>
            <table style={{ width: '100%', fontSize: 10, borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={{ padding: '3px 0', color: MUTED }}>Subtotal</td>
                  <td style={{ padding: '3px 0', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(sub)}</td>
                </tr>
                {disc > 0 && (
                  <tr>
                    <td style={{ padding: '3px 0', color: MUTED }}>
                      Discount {order.discount_type === 'percent' ? `(${order.discount_value}%)` : '(flat)'}
                    </td>
                    <td style={{ padding: '3px 0', textAlign: 'right', fontWeight: 600, color: '#DC2626' }}>−{formatCurrency(disc)}</td>
                  </tr>
                )}
                {order.tax_rate > 0 && (
                  <tr>
                    <td style={{ padding: '3px 0', color: MUTED }}>Tax ({order.tax_rate}%)</td>
                    <td style={{ padding: '3px 0', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(tax)}</td>
                  </tr>
                )}
                <tr>
                  <td colSpan={2} style={{ padding: '4px 0 0', borderTop: `2px solid ${PRIMARY}` }} />
                </tr>
                <tr>
                  <td style={{ padding: '2px 0', fontWeight: 700, fontSize: 12 }}>Total</td>
                  <td style={{ padding: '2px 0', textAlign: 'right', fontWeight: 800, fontSize: 14, color: PRIMARY }}>{formatCurrency(total)}</td>
                </tr>
                {(order.deposit_amount ?? 0) > 0 && (
                  <>
                    <tr>
                      <td style={{ padding: '3px 0', color: MUTED }}>Deposit Paid</td>
                      <td style={{ padding: '3px 0', textAlign: 'right', fontWeight: 600, color: '#059669' }}>−{formatCurrency(order.deposit_amount)}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '3px 0', fontWeight: 700 }}>Balance Due</td>
                      <td style={{ padding: '3px 0', textAlign: 'right', fontWeight: 800, color: ACCENT }}>{formatCurrency(balance)}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{ marginTop: 16, paddingTop: 8, borderTop: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', fontSize: 8, color: MUTED }}>
          <span>{company.name}{company.email ? ` · ${company.email}` : ''}{company.phone ? ` · ${company.phone}` : ''}</span>
          <span>Order {order.order_number} · {new Date().toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}
