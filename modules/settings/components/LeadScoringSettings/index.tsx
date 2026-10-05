'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Target, Loader2, Save, Sparkles, Check, X, RotateCcw, Sheet, Copy, ChevronDown } from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspace.store';
import { cn } from '@/lib/utils';

interface Thresholds { hot: number; warm: number }
interface Suggestion { thresholds: Thresholds; guidance: string; rationale: string }

// Google Apps Script that upserts one row per lead (keyed by lead_id in column A).
// Paste into the connected Sheet's Apps Script editor and deploy as a web app.
const APPS_SCRIPT = `// AGENTiX — one row per lead. Deploy: Deploy > New deployment > Web app (access: Anyone).
var HEADERS = ['lead_id','name','phone','stage','temperature','score','signals','source','created_at','updated_at'];

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.row_type !== 'lead') return ok(); // ignore non-lead payloads
    var sh = sheetFor('Leads');
    var ids = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
    var row = -1;
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(data.lead_id)) { row = i + 2; break; }
    }
    var values = HEADERS.map(function (h) { return data[h] != null ? data[h] : ''; });
    if (row === -1) sh.appendRow(values);
    else sh.getRange(row, 1, 1, HEADERS.length).setValues([values]);
    return ok();
  } finally {
    lock.releaseLock();
  }
}

function sheetFor(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(HEADERS); }
  return sh;
}

function ok() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}`;

export function LeadScoringSettings() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);

  const [hot, setHot] = useState(61);
  const [warm, setWarm] = useState(31);
  const [guidance, setGuidance] = useState('');
  const [defaults, setDefaults] = useState<Thresholds>({ hot: 61, warm: 31 });
  const [isDefault, setIsDefault] = useState(true);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [leadsSheetUrl, setLeadsSheetUrl] = useState('');
  const [showScript, setShowScript] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;
    void (async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/lead-rules?workspaceId=${workspaceId}`);
        const data = (await res.json()) as {
          rules?: { thresholds: Thresholds; guidance?: string };
          defaults?: Thresholds;
          is_default?: boolean;
          leads_sheet_url?: string;
        };
        if (data.rules) {
          setHot(data.rules.thresholds.hot);
          setWarm(data.rules.thresholds.warm);
          setGuidance(data.rules.guidance ?? '');
        }
        if (data.defaults) setDefaults(data.defaults);
        setIsDefault(Boolean(data.is_default));
        setLeadsSheetUrl(data.leads_sheet_url ?? '');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [workspaceId]);

  const validRange = warm >= 1 && hot > warm && hot <= 100;

  const handleSave = async () => {
    if (!workspaceId) return;
    if (!validRange) {
      toast.error('Thresholds must satisfy 1 ≤ Warm < Hot ≤ 100');
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch('/api/lead-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, thresholds: { hot, warm }, guidance, leadsSheetUrl }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'save failed');
      }
      setIsDefault(false);
      toast.success('Lead scoring rules saved — applied on the next classification');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSuggest = async () => {
    if (!workspaceId) return;
    setIsSuggesting(true);
    setSuggestion(null);
    try {
      const res = await fetch('/api/lead-rules/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      });
      const data = (await res.json()) as { suggestion?: Suggestion; error?: string };
      if (!res.ok || !data.suggestion) throw new Error(data.error ?? 'suggest failed');
      setSuggestion(data.suggestion);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not generate a suggestion');
    } finally {
      setIsSuggesting(false);
    }
  };

  const acceptSuggestion = () => {
    if (!suggestion) return;
    setHot(suggestion.thresholds.hot);
    setWarm(suggestion.thresholds.warm);
    if (suggestion.guidance) setGuidance(suggestion.guidance);
    setSuggestion(null);
    toast.success('Applied to the form — review, then Save');
  };

  const resetToDefault = () => {
    setHot(defaults.hot);
    setWarm(defaults.warm);
    setGuidance('');
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-10 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }

  // Band widths for the preview bar (0..100).
  const coldW = Math.max(0, Math.min(100, warm));
  const warmW = Math.max(0, Math.min(100, hot) - coldW);
  const hotW = Math.max(0, 100 - coldW - warmW);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Target className="h-5 w-5 text-brand-500" />
            Lead Scoring
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The AI scores every conversation 0–100 from the customer&apos;s intent. These thresholds
            decide where Hot / Warm / Cold begin, and your guidance tells the AI what counts as a strong
            buying signal for <span className="font-medium text-foreground">your</span> business.
          </p>
        </div>
        <Button size="sm" onClick={() => void handleSave()} disabled={isSaving || !validRange}>
          {isSaving ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Saving…</>
          ) : (
            <><Save className="h-3.5 w-3.5 mr-1.5" />Save</>
          )}
        </Button>
      </div>

      {/* Band preview */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Temperature bands</p>
          {isDefault && (
            <span className="text-[11px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
              Using platform defaults
            </span>
          )}
        </div>
        <div className="flex h-7 w-full overflow-hidden rounded-md text-[11px] font-medium text-white">
          <div className="flex items-center justify-center bg-sky-400/90" style={{ width: `${coldW}%` }}>
            {coldW > 12 && `Cold 0–${Math.max(0, warm - 1)}`}
          </div>
          <div className="flex items-center justify-center bg-amber-400/90" style={{ width: `${warmW}%` }}>
            {warmW > 12 && `Warm ${warm}–${hot - 1}`}
          </div>
          <div className="flex items-center justify-center bg-red-500/90" style={{ width: `${hotW}%` }}>
            {hotW > 12 && `Hot ${hot}–100`}
          </div>
        </div>
        {!validRange && (
          <p className="text-xs text-red-500">Thresholds must satisfy 1 ≤ Warm &lt; Hot ≤ 100.</p>
        )}
      </div>

      {/* Threshold inputs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-amber-400" />
            <p className="text-sm font-medium">Warm starts at</p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={99}
              value={warm}
              onChange={(e) => setWarm(Math.round(Number(e.target.value)))}
              className="w-24 h-8 text-sm"
            />
            <span className="text-sm text-muted-foreground">/ 100</span>
          </div>
          <p className="text-xs text-muted-foreground">Below this score a lead stays Cold.</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-red-500" />
            <p className="text-sm font-medium">Hot starts at</p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={2}
              max={100}
              value={hot}
              onChange={(e) => setHot(Math.round(Number(e.target.value)))}
              className="w-24 h-8 text-sm"
            />
            <span className="text-sm text-muted-foreground">/ 100</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Raise this for high-ticket / long-cycle businesses so only strong signals read Hot.
          </p>
        </div>
      </div>

      {/* Guidance */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Business-specific guidance</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Plain-language rules the AI weighs when scoring — e.g. “asking for an appointment slot or a
              procedure price is high intent; asking clinic timings is low intent.”
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleSuggest()}
            disabled={isSuggesting}
            className="shrink-0"
          >
            {isSuggesting ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Analysing…</>
            ) : (
              <><Sparkles className="h-3.5 w-3.5 mr-1.5" />AI suggest</>
            )}
          </Button>
        </div>
        <textarea
          value={guidance}
          onChange={(e) => setGuidance(e.target.value.slice(0, 1200))}
          rows={5}
          placeholder="Leave blank to use the general-purpose scoring rubric."
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">{guidance.length}/1200</span>
          <button
            type="button"
            onClick={resetToDefault}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
            Reset to defaults
          </button>
        </div>
      </div>

      {/* AI suggestion card */}
      {suggestion && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4 space-y-3">
          <p className="text-sm font-medium flex items-center gap-1.5 text-brand-700">
            <Sparkles className="h-4 w-4" />
            AI suggestion
          </p>
          <div className="text-sm text-foreground">
            <span className="font-medium">Thresholds:</span> Warm {suggestion.thresholds.warm}, Hot{' '}
            {suggestion.thresholds.hot}
          </div>
          {suggestion.rationale && (
            <p className="text-xs text-muted-foreground italic">{suggestion.rationale}</p>
          )}
          {suggestion.guidance && (
            <div className="rounded-lg border border-border bg-background p-3 text-xs text-foreground whitespace-pre-wrap">
              {suggestion.guidance}
            </div>
          )}
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" onClick={acceptSuggestion}>
              <Check className="h-3.5 w-3.5 mr-1.5" />
              Apply to form
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSuggestion(null)}>
              <X className="h-3.5 w-3.5 mr-1.5" />
              Dismiss
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Applying only fills the form — nothing changes until you press Save.
          </p>
        </div>
      )}

      {/* Google Sheet sync (one row per lead) */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div>
          <p className="text-sm font-medium flex items-center gap-1.5">
            <Sheet className="h-4 w-4 text-emerald-600" />
            Google Sheet sync (one row per lead)
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Mirror every lead into a Google Sheet — one row per lead, updated live as its score,
            stage and temperature change. Paste a Google Apps Script web-app URL below.
          </p>
        </div>
        <Input
          type="url"
          value={leadsSheetUrl}
          onChange={(e) => setLeadsSheetUrl(e.target.value)}
          placeholder="https://script.google.com/macros/s/…/exec"
          className="h-9 text-sm"
        />
        <button
          type="button"
          onClick={() => setShowScript((v) => !v)}
          className="flex items-center gap-1 text-[11px] text-brand-600 hover:text-brand-700"
        >
          <ChevronDown className={cn('h-3 w-3 transition-transform', showScript && 'rotate-180')} />
          {showScript ? 'Hide' : 'Show'} setup — paste this into Apps Script
        </button>
        {showScript && (
          <div className="space-y-2">
            <div className="relative">
              <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-[11px] leading-relaxed text-foreground">
                {APPS_SCRIPT}
              </pre>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(APPS_SCRIPT);
                  toast.success('Apps Script copied');
                }}
                className="absolute right-2 top-2 flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:bg-accent"
              >
                <Copy className="h-3 w-3" />
                Copy
              </button>
            </div>
            <ol className="list-decimal pl-4 text-[11px] text-muted-foreground space-y-0.5">
              <li>Open your Google Sheet → <span className="font-medium">Extensions → Apps Script</span>.</li>
              <li>Paste the code above, then <span className="font-medium">Deploy → New deployment → Web app</span>.</li>
              <li>Set “Who has access” to <span className="font-medium">Anyone</span>, deploy, and copy the web-app URL.</li>
              <li>Paste that URL above and press <span className="font-medium">Save</span>.</li>
            </ol>
          </div>
        )}
      </div>

      {/* How it works */}
      <div className="rounded-xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground text-sm">How it works</p>
        <p>• Every inbound message triggers an AI re-score of that conversation.</p>
        <p>• Temperature is derived from the score using the thresholds above — it can rise and fall.</p>
        <p>• A single greeting or generic question never reads Hot on its own.</p>
        <p>• Changes apply to the next classification; existing leads re-score as new messages arrive.</p>
        <p>• If a Leads Sheet is connected, each lead syncs to one live row on every re-score.</p>
      </div>
    </div>
  );
}
