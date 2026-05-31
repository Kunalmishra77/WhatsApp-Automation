'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Plus, X, MessageSquare, List } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ButtonItem {
  id: string;
  title: string;
}

interface ListRow {
  id: string;
  title: string;
  description: string;
}

interface ListSection {
  title: string;
  rows: ListRow[];
}

interface InteractiveMessageBuilderProps {
  open: boolean;
  onClose: () => void;
  conversationId: string;
}

function generateId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

export function InteractiveMessageBuilder({
  open,
  onClose,
  conversationId,
}: InteractiveMessageBuilderProps) {
  const [activeTab, setActiveTab] = useState<'button' | 'list'>('button');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Button tab state
  const [btnBody, setBtnBody] = useState('');
  const [btnHeader, setBtnHeader] = useState('');
  const [btnFooter, setBtnFooter] = useState('');
  const [buttons, setButtons] = useState<ButtonItem[]>([{ id: generateId('btn'), title: '' }]);

  // List tab state
  const [listBody, setListBody] = useState('');
  const [listHeader, setListHeader] = useState('');
  const [listFooter, setListFooter] = useState('');
  const [listButtonText, setListButtonText] = useState('View Options');
  const [sections, setSections] = useState<ListSection[]>([
    { title: '', rows: [{ id: generateId('row'), title: '', description: '' }] },
  ]);

  function resetForm() {
    setBtnBody('');
    setBtnHeader('');
    setBtnFooter('');
    setButtons([{ id: generateId('btn'), title: '' }]);
    setListBody('');
    setListHeader('');
    setListFooter('');
    setListButtonText('View Options');
    setSections([{ title: '', rows: [{ id: generateId('row'), title: '', description: '' }] }]);
    setError(null);
    setActiveTab('button');
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  // Button tab helpers
  function addButton() {
    if (buttons.length >= 3) return;
    setButtons((prev) => [...prev, { id: generateId('btn'), title: '' }]);
  }

  function removeButton(index: number) {
    setButtons((prev) => prev.filter((_, i) => i !== index));
  }

  function updateButton(index: number, title: string) {
    setButtons((prev) => prev.map((b, i) => (i === index ? { ...b, title } : b)));
  }

  // List tab helpers
  function addSection() {
    setSections((prev) => [
      ...prev,
      { title: '', rows: [{ id: generateId('row'), title: '', description: '' }] },
    ]);
  }

  function removeSection(sIndex: number) {
    setSections((prev) => prev.filter((_, i) => i !== sIndex));
  }

  function updateSectionTitle(sIndex: number, title: string) {
    setSections((prev) => prev.map((s, i) => (i === sIndex ? { ...s, title } : s)));
  }

  function addRow(sIndex: number) {
    setSections((prev) =>
      prev.map((s, i) =>
        i === sIndex
          ? { ...s, rows: [...s.rows, { id: generateId('row'), title: '', description: '' }] }
          : s,
      ),
    );
  }

  function removeRow(sIndex: number, rIndex: number) {
    setSections((prev) =>
      prev.map((s, i) =>
        i === sIndex ? { ...s, rows: s.rows.filter((_, j) => j !== rIndex) } : s,
      ),
    );
  }

  function updateRow(sIndex: number, rIndex: number, field: 'title' | 'description', value: string) {
    setSections((prev) =>
      prev.map((s, i) =>
        i === sIndex
          ? {
              ...s,
              rows: s.rows.map((r, j) => (j === rIndex ? { ...r, [field]: value } : r)),
            }
          : s,
      ),
    );
  }

  async function handleSend() {
    setError(null);

    const isButton = activeTab === 'button';

    if (isButton) {
      if (!btnBody.trim()) { setError('Body text is required'); return; }
      if (buttons.length === 0) { setError('Add at least one button'); return; }
      if (buttons.some((b) => !b.title.trim())) { setError('All buttons must have a title'); return; }
    } else {
      if (!listBody.trim()) { setError('Body text is required'); return; }
      if (!listButtonText.trim()) { setError('List button text is required'); return; }
      if (sections.length === 0) { setError('Add at least one section'); return; }
      if (sections.some((s) => s.rows.length === 0)) { setError('Each section must have at least one row'); return; }
      if (sections.some((s) => s.rows.some((r) => !r.title.trim()))) { setError('All row titles are required'); return; }
    }

    setIsSending(true);

    try {
      const body_payload = isButton
        ? {
            conversationId,
            type: 'button' as const,
            body: btnBody.trim(),
            header: btnHeader.trim() || undefined,
            footer: btnFooter.trim() || undefined,
            buttons: buttons.map((b) => ({ id: b.id, title: b.title.trim() })),
          }
        : {
            conversationId,
            type: 'list' as const,
            body: listBody.trim(),
            header: listHeader.trim() || undefined,
            footer: listFooter.trim() || undefined,
            listButtonText: listButtonText.trim(),
            sections: sections.map((s) => ({
              title: s.title,
              rows: s.rows.map((r) => ({
                id: r.id,
                title: r.title.trim(),
                description: r.description.trim() || undefined,
              })),
            })),
          };

      const res = await fetch('/api/messages/interactive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body_payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? 'Failed to send interactive message');
        return;
      }

      resetForm();
      onClose();
    } catch {
      setError('Network error — please try again');
    } finally {
      setIsSending(false);
    }
  }

  // Preview helpers
  const previewBody = activeTab === 'button' ? btnBody : listBody;
  const previewHeader = activeTab === 'button' ? btnHeader : listHeader;
  const previewFooter = activeTab === 'button' ? btnFooter : listFooter;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-brand-500" />
            Interactive Message
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Builder panel */}
          <div className="space-y-4">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'button' | 'list')}>
              <TabsList className="w-full">
                <TabsTrigger value="button" className="flex-1">
                  Quick Reply Buttons
                </TabsTrigger>
                <TabsTrigger value="list" className="flex-1">
                  List Message
                </TabsTrigger>
              </TabsList>

              {/* ── Quick Reply Buttons tab ── */}
              <TabsContent value="button" className="space-y-3 mt-4">
                <div className="space-y-1.5">
                  <Label htmlFor="btn-body">
                    Body <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="btn-body"
                    placeholder="What would you like to ask?"
                    value={btnBody}
                    onChange={(e) => setBtnBody(e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="btn-header">Header (optional)</Label>
                  <Input
                    id="btn-header"
                    placeholder="Header text"
                    value={btnHeader}
                    onChange={(e) => setBtnHeader(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="btn-footer">Footer (optional)</Label>
                  <Input
                    id="btn-footer"
                    placeholder="Footer text"
                    value={btnFooter}
                    onChange={(e) => setBtnFooter(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Buttons ({buttons.length}/3)</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addButton}
                      disabled={buttons.length >= 3}
                      className="h-7 text-xs gap-1"
                    >
                      <Plus className="h-3 w-3" />
                      Add Button
                    </Button>
                  </div>

                  {buttons.map((btn, idx) => (
                    <div key={btn.id} className="flex items-center gap-2">
                      <Input
                        placeholder={`Button ${idx + 1} title`}
                        value={btn.title}
                        onChange={(e) => updateButton(idx, e.target.value)}
                        maxLength={20}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeButton(idx)}
                        disabled={buttons.length === 1}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </TabsContent>

              {/* ── List Message tab ── */}
              <TabsContent value="list" className="space-y-3 mt-4">
                <div className="space-y-1.5">
                  <Label htmlFor="list-body">
                    Body <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="list-body"
                    placeholder="Message body text"
                    value={listBody}
                    onChange={(e) => setListBody(e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="list-header">Header (optional)</Label>
                  <Input
                    id="list-header"
                    placeholder="Header text"
                    value={listHeader}
                    onChange={(e) => setListHeader(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="list-footer">Footer (optional)</Label>
                  <Input
                    id="list-footer"
                    placeholder="Footer text"
                    value={listFooter}
                    onChange={(e) => setListFooter(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="list-btn-text">
                    List Button Text <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="list-btn-text"
                    placeholder="e.g. View Options"
                    value={listButtonText}
                    onChange={(e) => setListButtonText(e.target.value)}
                    maxLength={20}
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Sections</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addSection}
                      className="h-7 text-xs gap-1"
                    >
                      <Plus className="h-3 w-3" />
                      Add Section
                    </Button>
                  </div>

                  {sections.map((section, sIdx) => (
                    <div
                      key={sIdx}
                      className="rounded-lg border border-border p-3 space-y-2 bg-muted/30"
                    >
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="Section title"
                          value={section.title}
                          onChange={(e) => updateSectionTitle(sIdx, e.target.value)}
                          className="flex-1 h-7 text-sm"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeSection(sIdx)}
                          disabled={sections.length === 1}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      <div className="space-y-2 pl-1">
                        {section.rows.map((row, rIdx) => (
                          <div key={row.id} className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Input
                                placeholder="Row title"
                                value={row.title}
                                onChange={(e) => updateRow(sIdx, rIdx, 'title', e.target.value)}
                                className="flex-1 h-7 text-sm"
                                maxLength={24}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                                onClick={() => removeRow(sIdx, rIdx)}
                                disabled={section.rows.length === 1}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            <Input
                              placeholder="Description (optional)"
                              value={row.description}
                              onChange={(e) => updateRow(sIdx, rIdx, 'description', e.target.value)}
                              className="h-7 text-xs text-muted-foreground"
                              maxLength={72}
                            />
                          </div>
                        ))}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => addRow(sIdx)}
                          className="h-6 text-xs gap-1 text-muted-foreground"
                        >
                          <Plus className="h-3 w-3" />
                          Add Row
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Preview panel */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Preview
            </Label>
            <div className="rounded-2xl bg-[#ECE5DD] p-4 min-h-[200px] flex items-start">
              <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-white shadow-sm overflow-hidden text-sm">
                {previewHeader && (
                  <div className="px-3 pt-2.5 pb-1 font-semibold text-[13px] text-gray-900 border-b border-gray-100">
                    {previewHeader}
                  </div>
                )}
                <div className="px-3 py-2 text-gray-800 whitespace-pre-wrap break-words leading-snug min-h-[40px]">
                  {previewBody || <span className="text-gray-400 italic text-xs">Body text…</span>}
                </div>
                {previewFooter && (
                  <div className="px-3 pb-2 text-[11px] text-gray-400">{previewFooter}</div>
                )}

                {/* Button preview */}
                {activeTab === 'button' && buttons.length > 0 && (
                  <div className="border-t border-gray-100">
                    {buttons.map((btn, idx) => (
                      <div
                        key={btn.id}
                        className={cn(
                          'px-3 py-2 text-center text-[13px] font-medium text-[#00a5f4]',
                          idx < buttons.length - 1 && 'border-b border-gray-100',
                        )}
                      >
                        {btn.title || <span className="text-gray-300">Button {idx + 1}</span>}
                      </div>
                    ))}
                  </div>
                )}

                {/* List button preview */}
                {activeTab === 'list' && (
                  <div className="border-t border-gray-100 px-3 py-2 flex items-center justify-center gap-1.5 text-[13px] font-medium text-[#00a5f4]">
                    <List className="h-3.5 w-3.5" />
                    {listButtonText || 'View Options'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isSending}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleSend()}
            disabled={isSending}
            className="bg-brand-500 hover:bg-brand-600"
          >
            {isSending ? 'Sending…' : 'Send Interactive Message'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
