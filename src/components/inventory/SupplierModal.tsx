'use client';

// SupplierModal — Add Supplier or Edit Supplier (including notes).

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Building2 } from 'lucide-react';
import { useApp, type Supplier } from '@/context/AppContext';

interface SupplierModalProps {
  open: boolean;
  onClose: () => void;
  /** Present when editing; omitted when adding new. */
  editingSupplierId?: string;
  onSaved?: (supplier: Supplier) => void;
}

// Callers only mount this while `open` is true, so each open is a fresh
// mount — these initial values (derived from `editing`) double as the reset.
export function SupplierModal({ open, onClose, editingSupplierId, onSaved }: SupplierModalProps) {
  const { suppliers, addSupplier, updateSupplier } = useApp();
  const editing = editingSupplierId ? suppliers.find((s) => s.id === editingSupplierId) : undefined;
  const isEdit = Boolean(editing);

  const [name, setName] = useState(() => editing?.name ?? '');
  const [contact, setContact] = useState(() => editing?.contactPerson ?? '');
  const [phone, setPhone] = useState(() => editing?.phone ?? '');
  const [category, setCategory] = useState(() => editing?.category ?? 'Grains & Pulses');
  const [address, setAddress] = useState(() => editing?.address ?? '');
  const [status, setStatus] = useState<'Active' | 'Inactive'>(() => editing?.status ?? 'Active');
  const [notes, setNotes] = useState(() => editing?.notes ?? '');

  if (!open || typeof document === 'undefined') return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;

    if (isEdit && editingSupplierId) {
      const updated = updateSupplier(editingSupplierId, {
        name: name.trim(),
        contactPerson: contact.trim(),
        phone: phone.trim(),
        category,
        address: address.trim(),
        status,
        notes: notes.trim(),
      });
      if (updated) onSaved?.(updated);
    } else {
      const created = addSupplier({
        name: name.trim(),
        contactPerson: contact.trim(),
        phone: phone.trim(),
        category,
        address: address.trim(),
        status: 'Active',
        notes: notes.trim(),
      });
      onSaved?.(created);
    }
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-inverse-surface/60 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl w-full max-w-112 overflow-hidden shadow-xl border border-outline-variant">
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-primary text-base flex items-center gap-2">
              <Building2 className="size-4" />
              {isEdit ? 'Edit Supplier' : 'Add Supplier'}
            </h3>
            <button type="button" onClick={onClose} className="text-muted-foreground hover:bg-muted p-1 rounded-full transition-colors">×</button>
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-bold text-muted-foreground">Supplier Name</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Al-Madina Grain Traders" className="w-full rounded-lg border border-outline-variant p-3 text-sm outline-none focus:ring-1 focus:ring-primary focus:border-primary" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-bold text-muted-foreground">Contact Person</span>
            <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="e.g. Hassan Ali" className="w-full rounded-lg border border-outline-variant p-3 text-sm outline-none focus:ring-1 focus:ring-primary focus:border-primary" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-bold text-muted-foreground">Phone</span>
            <input required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+92 3XX XXXXXXX" className="w-full rounded-lg border border-outline-variant p-3 text-sm outline-none focus:ring-1 focus:ring-primary focus:border-primary" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-bold text-muted-foreground">Category</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-lg border border-outline-variant p-3 text-sm outline-none focus:ring-1 focus:ring-primary focus:border-primary bg-white">
                <option>Grains &amp; Pulses</option>
                <option>Spices</option>
                <option>Dairy &amp; Beverages</option>
                <option>General Goods</option>
                <option>Other</option>
              </select>
            </label>
            {isEdit && (
              <label className="block space-y-1">
                <span className="text-xs font-bold text-muted-foreground">Status</span>
                <select value={status} onChange={(e) => setStatus(e.target.value as 'Active' | 'Inactive')} className="w-full rounded-lg border border-outline-variant p-3 text-sm outline-none focus:ring-1 focus:ring-primary focus:border-primary bg-white">
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </label>
            )}
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-bold text-muted-foreground">Address</span>
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Warehouse / market address" className="w-full rounded-lg border border-outline-variant p-3 text-sm outline-none focus:ring-1 focus:ring-primary focus:border-primary" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-bold text-muted-foreground">Notes</span>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Delivery schedule, payment terms, reliability notes..." className="w-full resize-none rounded-lg border border-outline-variant p-3 text-sm outline-none focus:ring-1 focus:ring-primary focus:border-primary" />
          </label>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-outline-variant text-muted-foreground rounded-lg hover:bg-muted transition-all text-xs font-bold">Cancel</button>
            <button type="submit" className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 active:scale-95 transition-all text-xs font-bold">{isEdit ? 'Save Changes' : 'Add Supplier'}</button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
