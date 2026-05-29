'use client';

import { useState } from 'react';
import { ContactsTable } from '@/modules/contacts/components/ContactsTable';
import { ContactDetail } from '@/modules/contacts/components/ContactDetail';

export default function ContactsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="flex h-full overflow-hidden">
      <ContactsTable selectedId={selectedId} onSelect={setSelectedId} />
      {selectedId && (
        <ContactDetail contactId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
