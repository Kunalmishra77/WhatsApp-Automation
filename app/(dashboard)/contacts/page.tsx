'use client';

import { useState, useEffect } from 'react';
import { ContactsTable } from '@/modules/contacts/components/ContactsTable';
import { ContactDetail } from '@/modules/contacts/components/ContactDetail';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  FolderOpen, FolderPlus, Users, MoreHorizontal, Pencil, Trash2, Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { useWorkspaceStore } from '@/store/workspace.store';

interface ContactList { id: string; name: string; contact_count: number; color?: string }

const FOLDER_COLORS: Record<string, string> = {
  gray:   'bg-gray-200 text-gray-700',
  blue:   'bg-blue-100 text-blue-700',
  green:  'bg-green-100 text-green-700',
  orange: 'bg-orange-100 text-orange-700',
  purple: 'bg-purple-100 text-purple-700',
  red:    'bg-red-100 text-red-700',
};

export default function ContactsPage() {
  const [selectedId,     setSelectedId]     = useState<string | null>(null);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [lists,          setLists]          = useState<ContactList[]>([]);

  // New folder dialog
  const [newFolderOpen,  setNewFolderOpen]  = useState(false);
  const [newFolderName,  setNewFolderName]  = useState('');
  const [savingFolder,   setSavingFolder]   = useState(false);

  // Rename dialog
  const [renameList,     setRenameList]     = useState<ContactList | null>(null);
  const [renameName,     setRenameName]     = useState('');
  const [renaming,       setRenaming]       = useState(false);

  // Delete dialog
  const [deleteList,     setDeleteList]     = useState<ContactList | null>(null);
  const [deleting,       setDeleting]       = useState(false);

  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);

  const loadLists = () => {
    fetch('/api/contact-lists')
      .then((r) => r.json())
      .then((d) => setLists(d.lists ?? []))
      .catch(() => {});
  };

  useEffect(() => { loadLists(); }, []);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    setSavingFolder(true);
    try {
      const res = await fetch('/api/contact-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFolderName.trim(), source: 'manual' }),
      });
      const d = await res.json() as { list?: { id: string } };
      if (!res.ok) { toast.error('Failed to create folder'); return; }
      toast.success('Folder created');
      setNewFolderName('');
      setNewFolderOpen(false);
      loadLists();
      if (d.list?.id) setSelectedListId(d.list.id);
    } finally { setSavingFolder(false); }
  };

  const handleRename = async () => {
    if (!renameList || !renameName.trim()) return;
    setRenaming(true);
    try {
      await fetch(`/api/contact-lists/${renameList.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: renameName.trim() }),
      });
      toast.success('Folder renamed');
      setRenameList(null);
      loadLists();
    } finally { setRenaming(false); }
  };

  const handleDelete = async () => {
    if (!deleteList) return;
    setDeleting(true);
    try {
      await fetch(`/api/contact-lists/${deleteList.id}`, { method: 'DELETE' });
      toast.success('Folder deleted');
      if (selectedListId === deleteList.id) setSelectedListId(null);
      setDeleteList(null);
      loadLists();
    } finally { setDeleting(false); }
  };

  const handleExportFolder = (list: ContactList) => {
    const p = new URLSearchParams({ listId: list.id });
    window.open(`/api/contacts/bulk?${p}`, '_blank');
  };

  const totalContacts = lists.reduce((sum, l) => sum + l.contact_count, 0);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left sidebar — Folders */}
      <aside className="w-52 shrink-0 flex flex-col border-r border-border bg-card">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Folders</span>
          <Button variant="ghost" size="icon" className="h-6 w-6" title="New folder" onClick={() => setNewFolderOpen(true)}>
            <FolderPlus className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {/* All Contacts */}
          <button
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-accent rounded-none text-left ${!selectedListId ? 'bg-brand-50 text-brand-700 font-medium' : 'text-foreground'}`}
            onClick={() => setSelectedListId(null)}
          >
            <Users className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 truncate">All Contacts</span>
          </button>

          {lists.length > 0 && (
            <div className="px-3 py-1 mt-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Lists</p>
            </div>
          )}

          {lists.map((list) => (
            <div
              key={list.id}
              className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors hover:bg-accent ${selectedListId === list.id ? 'bg-brand-50 text-brand-700' : ''}`}
              onClick={() => setSelectedListId(list.id)}
            >
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-orange-400" />
              <span className="flex-1 text-sm truncate">{list.name}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">{list.contact_count}</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setRenameList(list); setRenameName(list.name); }}>
                    <Pencil className="h-3.5 w-3.5 mr-2" /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleExportFolder(list); }}>
                    <Download className="h-3.5 w-3.5 mr-2" /> Export CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={(e) => { e.stopPropagation(); setDeleteList(list); }}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>

        <div className="px-3 py-2 border-t border-border text-xs text-muted-foreground">
          {lists.length} folder{lists.length !== 1 ? 's' : ''}
        </div>
      </aside>

      {/* Main contact table */}
      <ContactsTable
        selectedId={selectedId}
        onSelect={setSelectedId}
        listId={selectedListId ?? undefined}
      />

      {selectedId && (
        <ContactDetail contactId={selectedId} onClose={() => setSelectedId(null)} />
      )}

      {/* New Folder Dialog */}
      <Dialog open={newFolderOpen} onOpenChange={(o) => { if (!o) { setNewFolderOpen(false); setNewFolderName(''); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderPlus className="h-4 w-4" /> New Folder
            </DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Folder name (e.g. Delhi Leads July 2026)"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleCreateFolder(); }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setNewFolderOpen(false); setNewFolderName(''); }}>Cancel</Button>
            <Button size="sm" onClick={() => void handleCreateFolder()} disabled={!newFolderName.trim() || savingFolder}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={!!renameList} onOpenChange={(o) => { if (!o) setRenameList(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename Folder</DialogTitle>
          </DialogHeader>
          <Input
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleRename(); }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRenameList(null)}>Cancel</Button>
            <Button size="sm" onClick={() => void handleRename()} disabled={!renameName.trim() || renaming}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteList} onOpenChange={(o) => { if (!o) setDeleteList(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10 mb-2">
              <Trash2 className="h-5 w-5 text-destructive" />
            </div>
            <DialogTitle>Delete "{deleteList?.name}"?</DialogTitle>
            <DialogDescription>
              This folder will be removed. Contacts inside it will NOT be deleted — they remain in All Contacts.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteList(null)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={() => void handleDelete()} disabled={deleting}>Delete Folder</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
