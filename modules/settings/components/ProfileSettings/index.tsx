'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Camera, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { createClient } from '@/services/supabase/client';
import { toast } from 'sonner';

const schema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters').max(100),
});
type FormValues = z.infer<typeof schema>;

export function ProfileSettings() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const initials = (user?.full_name ?? 'U').slice(0, 2).toUpperCase();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file || !user) return;
    if (!file.type.startsWith('image/')) { toast.error('Please choose an image'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5 MB'); return; }

    setUploading(true);
    try {
      const supabase = createClient() as any;
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `avatars/${user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('media-uploads')
        .upload(path, file, { upsert: true, cacheControl: '3600', contentType: file.type });
      if (upErr) { toast.error('Upload failed — please try again'); return; }

      const { data: { publicUrl } } = supabase.storage.from('media-uploads').getPublicUrl(path);
      const { error: updErr } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id);
      if (updErr) { toast.error('Could not save your photo'); return; }

      setUser({ ...user, avatar_url: publicUrl });
      toast.success('Profile photo updated');
    } catch {
      toast.error('Upload failed — please try again');
    } finally {
      setUploading(false);
    }
  }

  const { register, handleSubmit, reset, formState: { errors, isSubmitting, isDirty } } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: { full_name: user?.full_name ?? '' },
    });

  // Sync form when store hydrates after SSR
  useEffect(() => {
    if (user?.full_name !== undefined) reset({ full_name: user.full_name });
  }, [user?.full_name, reset]);

  const onSubmit = async (values: FormValues) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createClient() as any;
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: values.full_name })
      .eq('id', user!.id);
    if (error) toast.error('Failed to update profile');
    else toast.success('Profile saved');
  };

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-base font-semibold text-foreground">Profile</h2>
        <p className="text-sm text-muted-foreground">Manage your name and preferences.</p>
      </div>
      <Separator />

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="group relative rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          title="Change profile photo"
        >
          <Avatar className="h-16 w-16">
            <AvatarImage src={user?.avatar_url ?? undefined} />
            <AvatarFallback className="bg-brand-100 text-brand-700 text-xl font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
            {uploading ? <Loader2 className="h-5 w-5 animate-spin text-white" /> : <Camera className="h-5 w-5 text-white" />}
          </span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
        <div>
          <p className="text-sm font-medium text-foreground">{user?.full_name}</p>
          <p className="text-xs text-muted-foreground">{user?.email}</p>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="mt-1 text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50"
          >
            {uploading ? 'Uploading…' : 'Change photo'}
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="full_name">Full Name</Label>
          <Input id="full_name" {...register('full_name')} />
          {errors.full_name && <p className="text-xs text-destructive">{errors.full_name.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={user?.email ?? ''} disabled className="bg-muted" />
          <p className="text-xs text-muted-foreground">Email changes require re-verification.</p>
        </div>
        <Button type="submit" size="sm" disabled={isSubmitting || !isDirty}>
          {isSubmitting ? 'Saving…' : 'Save Changes'}
        </Button>
      </form>
    </div>
  );
}
