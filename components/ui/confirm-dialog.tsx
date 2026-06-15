'use client';

import { AlertTriangle, Trash2 } from 'lucide-react';
import { Button } from './button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from './dialog';

interface ConfirmDialogProps {
  open:        boolean;
  title:       string;
  description: string;
  confirmLabel?: string;
  variant?:    'destructive' | 'warning';
  loading?:    boolean;
  onConfirm:   () => void;
  onCancel:    () => void;
}

export function ConfirmDialog({
  open, title, description, confirmLabel = 'Delete', variant = 'destructive', loading, onConfirm, onCancel,
}: ConfirmDialogProps) {
  const iconBg  = variant === 'destructive' ? 'bg-destructive/10' : 'bg-amber-50';
  const iconCls = variant === 'destructive' ? 'text-destructive' : 'text-amber-600';
  const Icon    = variant === 'destructive' ? Trash2 : AlertTriangle;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl mb-2 ${iconBg}`}>
            <Icon className={`h-5 w-5 ${iconCls}`} />
          </div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            size="sm"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Please wait…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
