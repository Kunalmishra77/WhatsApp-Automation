import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// GET /api/catalog?workspaceId=xxx  — returns saved catalog_id + cached products
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'manage_workspace');
    const db = createAdminClient() as any;

    const { data: ws } = await db
      .from('workspaces')
      .select('catalog_id')
      .eq('id', workspaceId)
      .single();

    const { data: products } = await db
      .from('catalog_products')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('name');

    return NextResponse.json({
      catalog_id: ws?.catalog_id ?? null,
      products: products ?? [],
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/catalog  — save catalog_id + sync products from Meta
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { workspaceId: string; catalogId: string };
    if (!body.workspaceId || !body.catalogId) {
      return NextResponse.json({ error: 'workspaceId and catalogId required' }, { status: 400 });
    }

    await requireWorkspacePermission(body.workspaceId, 'manage_workspace');
    const db = createAdminClient() as any;

    // Save catalog_id to workspace
    await db.from('workspaces').update({ catalog_id: body.catalogId }).eq('id', body.workspaceId);

    // Get workspace access token for Meta API
    const { data: ws } = await db
      .from('workspaces')
      .select('access_token')
      .eq('id', body.workspaceId)
      .single();

    const accessToken = ws?.access_token ?? process.env.WHATSAPP_ACCESS_TOKEN;
    if (!accessToken) {
      return NextResponse.json({ catalog_id: body.catalogId, synced: 0, error: 'No access token' });
    }

    // Fetch products from Meta Catalog API
    let synced = 0;
    try {
      const metaRes = await fetch(
        `https://graph.facebook.com/v19.0/${body.catalogId}/products?fields=retailer_id,name,description,price,currency,image_url,availability&limit=100&access_token=${accessToken.replace(/﻿/g, '').trim()}`,
      );

      if (metaRes.ok) {
        const metaData = await metaRes.json() as {
          data?: Array<{
            retailer_id: string;
            name: string;
            description?: string;
            price?: string;
            currency?: string;
            image_url?: string;
            availability?: string;
          }>;
        };

        const products = (metaData.data ?? []).map((p) => ({
          workspace_id:  body.workspaceId,
          catalog_id:    body.catalogId,
          retailer_id:   p.retailer_id,
          name:          p.name,
          description:   p.description ?? null,
          price:         p.price ?? null,
          currency:      p.currency ?? null,
          image_url:     p.image_url ?? null,
          availability:  p.availability ?? 'in stock',
          synced_at:     new Date().toISOString(),
        }));

        if (products.length > 0) {
          // Delete old products for this catalog, insert fresh
          await db.from('catalog_products')
            .delete()
            .eq('workspace_id', body.workspaceId)
            .eq('catalog_id', body.catalogId);

          await db.from('catalog_products').insert(products);
          synced = products.length;
        }
      }
    } catch (syncErr) {
      console.error('[Catalog] Meta sync error:', syncErr);
    }

    return NextResponse.json({ catalog_id: body.catalogId, synced });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/catalog  — disconnect catalog
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json() as { workspaceId: string };
    if (!body.workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(body.workspaceId, 'manage_workspace');
    const db = createAdminClient() as any;

    await db.from('workspaces').update({ catalog_id: null }).eq('id', body.workspaceId);
    await db.from('catalog_products').delete().eq('workspace_id', body.workspaceId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
