// Bellekteki durum + DB'ye yazma. Görünümler sadece buradan okur/yazar.
import * as db from './db.js';
import { DEFAULT_SETTINGS, isSlotTaken } from './core.js';

export const state = { customers: [], appointments: [], settings: DEFAULT_SETTINGS };

const byName = (a, b) => a.name.localeCompare(b.name, 'tr');

export async function load() {
  const [c, a, s] = await Promise.all([db.getAll('customers'), db.getAll('appointments'), db.getSettings()]);
  state.customers = c.sort(byName);
  state.appointments = a;
  state.settings = s;
  if (!state.settings.firstUseAt) await saveSettings({ firstUseAt: new Date().toISOString() });
}

export const customerById = (id) => state.customers.find((c) => c.id === id);
export const apptsOf = (customerId) =>
  state.appointments.filter((a) => a.customerId === customerId).sort((x, y) => (y.date + y.time).localeCompare(x.date + x.time));

// ---- Randevular ----
export async function addAppointment({ customerId, date, time, note = '', services = [] }) {
  if (isSlotTaken(state.appointments, date, time)) throw new Error('Bu saat zaten dolu');
  const ap = { id: db.uid(), customerId, date, time, note, services, createdAt: new Date().toISOString() };
  await db.put('appointments', ap);
  state.appointments.push(ap);
  return ap;
}
export async function updateAppointment(ap) {
  await db.put('appointments', ap);
  const i = state.appointments.findIndex((x) => x.id === ap.id);
  if (i >= 0) state.appointments[i] = ap;
}
export async function moveAppointment(id, date, time) {
  const ap = state.appointments.find((a) => a.id === id);
  if (state.appointments.some((a) => a.id !== id && a.date === date && a.time === time)) throw new Error('Bu saat zaten dolu');
  await updateAppointment({ ...ap, date, time });
}
export async function removeAppointment(id) {
  const ap = state.appointments.find((a) => a.id === id);
  await db.remove('appointments', id);
  state.appointments = state.appointments.filter((a) => a.id !== id);
  return ap;
}
export async function restoreAppointment(ap) {
  if (isSlotTaken(state.appointments, ap.date, ap.time)) throw new Error('Bu saat artık dolu, geri alınamadı');
  await db.put('appointments', ap);
  state.appointments.push(ap);
}

// ---- Müşteriler ----
export async function saveCustomer(c) {
  const customer = { note: '', phone: '', ...c, id: c.id || db.uid() };
  customer.name = customer.name.trim();
  await db.put('customers', customer);
  const i = state.customers.findIndex((x) => x.id === customer.id);
  if (i >= 0) state.customers[i] = customer; else state.customers.push(customer);
  state.customers.sort(byName);
  return customer;
}
export async function deleteCustomer(id) {
  const customer = customerById(id);
  const appts = state.appointments.filter((a) => a.customerId === id);
  for (const a of appts) await db.remove('appointments', a.id);
  await db.remove('customers', id);
  state.appointments = state.appointments.filter((a) => a.customerId !== id);
  state.customers = state.customers.filter((c) => c.id !== id);
  return { customer, appts };
}
export async function restoreCustomer({ customer, appts }) {
  await saveCustomer(customer);
  for (const a of appts) { await db.put('appointments', a); state.appointments.push(a); }
}

// ---- Ayarlar ----
export async function saveSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  await db.saveSettings(state.settings);
}

export async function reloadAfterImport() { await load(); }
