// Native (non-endpoint) Meta WhatsApp Flow support.
//
// A "non-endpoint" Flow is entirely self-contained inside the Flow JSON: there is
// no `data_api_version` key and no server round-trip while the user fills the
// form. When the user taps the terminal screen's Footer, WhatsApp sends the
// declared payload straight back to us as an `nfm_reply` message (see
// `parseNfmReply` below) — no Flow endpoint needed.
//
// This module builds that Flow JSON, generates the opaque `flow_token` used to
// correlate a sent Flow with its eventual reply, and parses the reply payload.

import { randomUUID } from 'node:crypto';

/**
 * Builds the Flow JSON for the "Lead Capture" template: a single terminal
 * screen with a short contact form. Non-endpoint Flow — no `data_api_version`.
 */
export function buildLeadCaptureFlowJson(): object {
  return {
    version: '5.1',
    screens: [
      {
        id: 'LEAD_CAPTURE',
        title: 'Contact Details',
        terminal: true,
        data: {
          flow_token: {
            type: 'string',
            __example__: 'x',
          },
        },
        layout: {
          type: 'SingleColumnLayout',
          children: [
            {
              type: 'TextHeading',
              text: 'Share your details',
            },
            {
              type: 'TextInput',
              name: 'full_name',
              label: 'Full name',
              required: true,
            },
            {
              type: 'TextInput',
              name: 'phone',
              label: 'Phone',
              'input-type': 'phone',
            },
            {
              type: 'TextInput',
              name: 'email',
              label: 'Email',
              'input-type': 'email',
              required: false,
            },
            {
              type: 'TextArea',
              name: 'interest',
              label: 'What are you interested in?',
              required: false,
            },
            {
              type: 'Footer',
              label: 'Submit',
              'on-click-action': {
                name: 'complete',
                payload: {
                  full_name: '${form.full_name}',
                  phone: '${form.phone}',
                  email: '${form.email}',
                  interest: '${form.interest}',
                  flow_token: '${data.flow_token}',
                },
              },
            },
          ],
        },
      },
    ],
  };
}

export const NATIVE_FLOW_TEMPLATES: Record<
  string,
  { key: string; name: string; firstScreen: string; buildJson: () => object }
> = {
  lead_capture: {
    key: 'lead_capture',
    name: 'Lead Capture',
    firstScreen: 'LEAD_CAPTURE',
    buildJson: buildLeadCaptureFlowJson,
  },
};

/**
 * Parses the `response_json` string from an inbound `nfm_reply` interactive
 * message. Never throws — malformed or non-object input yields an empty
 * result so callers can treat it uniformly.
 */
export function parseNfmReply(responseJson: string): {
  flow_token: string | null;
  fields: Record<string, string>;
} {
  try {
    const parsed = JSON.parse(responseJson);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { flow_token: null, fields: {} };
    }
    const { flow_token, ...rest } = parsed as Record<string, unknown>;
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(rest)) {
      fields[k] = String(v);
    }
    return {
      flow_token: typeof flow_token === 'string' ? flow_token : null,
      fields,
    };
  } catch {
    return { flow_token: null, fields: {} };
  }
}

/** Generates a new opaque, prefixed flow token to correlate a sent Flow with its reply. */
export function newFlowToken(): string {
  return 'flw_' + randomUUID();
}
