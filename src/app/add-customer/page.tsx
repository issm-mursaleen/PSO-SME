'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useApp } from '@/context/AppContext';
import { Icon } from '@/components/ui/Icon';

export default function AddCustomer() {
  const router = useRouter();
  const { addCustomer, customers } = useApp();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [customerType, setCustomerType] = useState('Household');
  const [preferredChannel, setPreferredChannel] = useState('WhatsApp');
  const [neighborhood, setNeighborhood] = useState('');
  const [address, setAddress] = useState('');
  const [creditLimit, setCreditLimit] = useState('50000');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [status, setStatus] = useState<'Active' | 'Inactive'>('Active');
  const [notes, setNotes] = useState('');

  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);

  const handleNameChange = (val: string) => {
    setName(val);
    // Trigger duplicate warning specifically for "Imran Khan" (case-insensitive) as per mockup template
    if (val.toLowerCase().includes('imran khan')) {
      setShowDuplicateWarning(true);
    } else {
      setShowDuplicateWarning(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) return;

    addCustomer({
      name,
      phone: `+92 ${phone}`,
      type: customerType,
      channel: preferredChannel,
      neighborhood,
      address,
      creditLimit: parseFloat(creditLimit) || 0,
      balance: parseFloat(openingBalance) || 0,
      status,
      notes,
    });

    router.push('/customers');
  };

  return (
    <div className="p-6">
      <div className="max-w-5xl mx-auto">
        {/* Breadcrumbs */}
        <nav className="flex items-center gap-2 text-label-md text-on-surface-variant mb-6 text-xs font-bold">
          <Link href="/customers" className="hover:text-primary">
            Customers
          </Link>
          <Icon name="chevron_right" size={14} />
          <span className="text-primary font-bold">Add New Customer</span>
        </nav>

        {/* Duplicate Warning Alert */}
        {showDuplicateWarning && (
          <div className="mb-6 bg-error-container border border-error rounded-xl p-4 flex items-start gap-4" id="duplicate-warning">
            <div className="bg-error text-on-error rounded-full p-1 flex items-center justify-center">
              <Icon name="warning" size={20} />
            </div>
            <div className="flex-1">
              <h3 className="text-on-error-container font-headline-sm text-headline-sm font-bold text-sm">Potential Duplicate Found</h3>
              <p className="text-on-error-container text-body-md mt-1 text-xs">
                A similar customer named <strong>Imran Khan</strong> already exists in your ledger with phone <strong>+92 300 1234567</strong>.
              </p>
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => router.push('/customers/cust-imran')}
                  className="px-4 py-2 bg-on-error-container text-surface-bright rounded-lg font-label-md text-xs font-bold hover:bg-opacity-90"
                >
                  Review Existing
                </button>
                <button
                  type="button"
                  onClick={() => setShowDuplicateWarning(false)}
                  className="px-4 py-2 border border-on-error-container text-on-error-container rounded-lg font-label-md text-xs font-bold hover:bg-on-error-container/5"
                >
                  Continue Creating
                </button>
              </div>
            </div>
            <button
              type="button"
              className="text-on-error-container hover:bg-on-error-container/10 p-0.5 rounded transition-colors"
              onClick={() => setShowDuplicateWarning(false)}
            >
              <Icon name="close" size={18} />
            </button>
          </div>
        )}

        {/* Form Container */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-outline-variant bg-surface-container-low">
            <h3 className="font-headline-sm text-headline-sm text-primary font-bold text-lg">Customer Profile Details</h3>
            <p className="text-body-sm text-on-surface-variant text-xs mt-1">Fields marked with an asterisk (*) are mandatory for credit limits.</p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
              
              {/* Left Column: Primary Info */}
              <div className="space-y-6">
                <div>
                  <label className="block text-body-sm font-bold text-on-surface-variant mb-1.5 text-xs">Full Name *</label>
                  <input
                    required
                    type="text"
                    className="w-full border border-outline-variant rounded-lg p-3 text-body-md focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all outline-none"
                    placeholder="e.g. Imran Khan"
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-body-sm font-bold text-on-surface-variant mb-1.5 text-xs">Phone Number *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant font-numeric-data text-sm font-bold">+92</span>
                    <input
                      required
                      type="tel"
                      pattern="[0-9]{10}"
                      className="w-full border border-outline-variant rounded-lg p-3 pl-12 text-body-md focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all outline-none"
                      placeholder="300 0000000"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                  <p className="text-[10px] text-outline mt-1 font-medium">Format: 10 digits without leading zero (e.g. 3001234567)</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-body-sm font-bold text-on-surface-variant mb-1.5 text-xs">Customer Type</label>
                    <select
                      className="w-full border border-outline-variant rounded-lg p-3 text-body-md focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all outline-none bg-transparent"
                      value={customerType}
                      onChange={(e) => setCustomerType(e.target.value)}
                    >
                      <option value="Household">Household</option>
                      <option value="Retailer">Retailer</option>
                      <option value="Hotel / Restaurant">Hotel / Restaurant</option>
                      <option value="Wholesaler">Wholesaler</option>
                      <option value="Corporate">Corporate</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-body-sm font-bold text-on-surface-variant mb-1.5 text-xs">Preferred Channel</label>
                    <select
                      className="w-full border border-outline-variant rounded-lg p-3 text-body-md focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all outline-none bg-transparent"
                      value={preferredChannel}
                      onChange={(e) => setPreferredChannel(e.target.value)}
                    >
                      <option value="WhatsApp">WhatsApp</option>
                      <option value="SMS">SMS</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-body-sm font-bold text-on-surface-variant mb-1.5 text-xs">Area / Neighborhood</label>
                  <input
                    type="text"
                    className="w-full border border-outline-variant rounded-lg p-3 text-body-md focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all outline-none"
                    placeholder="e.g. Clifton Block 5"
                    value={neighborhood}
                    onChange={(e) => setNeighborhood(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-body-sm font-bold text-on-surface-variant mb-1.5 text-xs">Detailed Address</label>
                  <textarea
                    rows={3}
                    className="w-full border border-outline-variant rounded-lg p-3 text-body-md focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all outline-none resize-none"
                    placeholder="Shop No, Street, Landmark..."
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  ></textarea>
                </div>
              </div>

              {/* Right Column: Financials & Status */}
              <div className="space-y-6">
                <div className="p-4 bg-surface-container-low rounded-xl border border-outline-variant">
                  <h4 className="text-label-md text-primary uppercase tracking-wider mb-4 font-bold text-xs">Financial Configuration</h4>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-body-sm font-bold text-on-surface-variant mb-1.5 text-xs">Udhar Limit (PKR)</label>
                      <div className="relative">
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant font-label-md text-xs font-bold">Max Credit</span>
                        <input
                          type="number"
                          className="w-full border border-outline-variant rounded-lg p-3 text-body-md font-numeric-data focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all outline-none"
                          value={creditLimit}
                          onChange={(e) => setCreditLimit(e.target.value)}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-body-sm font-bold text-on-surface-variant mb-1.5 text-xs">Opening Balance (PKR)</label>
                      <div className="relative">
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant font-label-md text-xs font-bold">Initial Due</span>
                        <input
                          type="number"
                          className="w-full border border-outline-variant rounded-lg p-3 text-body-md font-numeric-data focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all outline-none"
                          value={openingBalance}
                          onChange={(e) => setOpeningBalance(e.target.value)}
                        />
                      </div>
                      <p className="text-[11px] text-outline mt-1 italic">Use negative values for advance payments.</p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-body-sm font-bold text-on-surface-variant mb-1.5 text-xs">Profile Status</label>
                  <div className="flex gap-4">
                    <button
                      type="button"
                      onClick={() => setStatus('Active')}
                      className={`flex-1 flex items-center justify-center gap-2 p-3 border-2 rounded-lg cursor-pointer transition-all active:scale-95 ${
                        status === 'Active'
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-outline-variant text-on-surface-variant hover:bg-surface-container'
                      }`}
                    >
                      <Icon name="check_circle" size={18} />
                      <span className="text-label-md font-bold text-xs">Active</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatus('Inactive')}
                      className={`flex-1 flex items-center justify-center gap-2 p-3 border-2 rounded-lg cursor-pointer transition-all active:scale-95 ${
                        status === 'Inactive'
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-outline-variant text-on-surface-variant hover:bg-surface-container'
                      }`}
                    >
                      <Icon name="pause_circle" size={18} />
                      <span className="text-label-md font-bold text-xs">Inactive</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-body-sm font-bold text-on-surface-variant mb-1.5 text-xs">Internal Notes</label>
                  <textarea
                    rows={4}
                    className="w-full border border-outline-variant rounded-lg p-3 text-body-md focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all outline-none resize-none"
                    placeholder="Special delivery instructions, credit history notes, or family relations..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  ></textarea>
                </div>
              </div>

            </div>

            {/* Bottom Actions */}
            <div className="pt-8 border-t border-outline-variant flex items-center justify-end gap-4">
              <Link
                href="/customers"
                className="px-6 py-2.5 text-on-surface-variant font-bold text-body-md hover:bg-surface-container rounded-lg transition-colors text-sm"
              >
                Cancel
              </Link>
              <button
                type="submit"
                className="px-8 py-2.5 bg-primary text-on-primary font-bold text-body-md rounded-lg shadow-sm hover:brightness-110 active:scale-95 transition-all flex items-center gap-2 text-sm"
              >
                <Icon name="person_add" size={18} />
                Save Customer
              </button>
            </div>
          </form>
        </div>

        {/* Bento Cards Footer */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 flex gap-4 items-center shadow-sm">
            <div className="w-12 h-12 rounded-lg bg-primary-fixed flex items-center justify-center text-primary">
              <Icon name="verified" size={24} />
            </div>
            <div>
              <h4 className="font-headline-sm text-label-md text-on-surface font-bold text-xs">KYC Verified</h4>
              <p className="text-body-sm text-on-surface-variant text-xs mt-0.5">Profiles with full addresses get 20% higher credit limit approval.</p>
            </div>
          </div>
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 flex gap-4 items-center shadow-sm">
            <div className="w-12 h-12 rounded-lg bg-secondary-fixed flex items-center justify-center text-secondary">
              <Icon name="whatshot" size={24} />
            </div>
            <div>
              <h4 className="font-headline-sm text-label-md text-on-surface font-bold text-xs">Auto-Connect</h4>
              <p className="text-body-sm text-on-surface-variant text-xs mt-0.5">Weekly digital invoices will be sent automatically to WhatsApp.</p>
            </div>
          </div>
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 flex gap-4 items-center shadow-sm">
            <div className="w-12 h-12 rounded-lg bg-tertiary-fixed flex items-center justify-center text-tertiary">
              <Icon name="lock_reset" size={24} />
            </div>
            <div>
              <h4 className="font-headline-sm text-label-md text-on-surface font-bold text-xs">Data Privacy</h4>
              <p className="text-body-sm text-on-surface-variant text-xs mt-0.5">Customer contact data is encrypted and visible only to the owner.</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
