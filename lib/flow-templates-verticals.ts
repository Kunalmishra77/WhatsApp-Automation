// lib/flow-templates-verticals.ts
//
// Starting points for the businesses actually on this platform.
//
// The five templates that existed were generic — Welcome Message, Out of
// Office, Lead Qualifier — and a gym owner opening "Lead Qualifier" still had
// to write every line themselves. These are the verticals the twelve live
// workspaces fall into, with copy a client can send as it stands or edit in a
// minute.
//
// They are also where the newer steps get discovered. A client who has never
// noticed the Wait step finds one in the follow-up template; one who did not
// know a question can offer buttons sees it in the first template they open.
// Nothing teaches a feature like finding it already used.
//
// The copy mixes English and Hindi the way these businesses write to their own
// customers, because a template nobody would send is not a starting point.

import type { FlowNode, FlowEdge } from '@/modules/flows/types';
import type { FlowTemplate } from './flow-templates';

type Step =
  | { kind: 'message'; text: string }
  | { kind: 'ask'; text: string; saveAs?: string; choices?: string[] }
  | { kind: 'wait'; hours?: number; days?: number }
  | { kind: 'action'; label: string; operations: Array<Record<string, unknown>> }
  | { kind: 'handoff'; text: string }
  | { kind: 'end'; text: string };

const msg = (text: string): Step => ({ kind: 'message', text });
const ask = (text: string, saveAs?: string, choices?: string[]): Step =>
  ({ kind: 'ask', text, saveAs, choices });
const wait = (o: { hours?: number; days?: number }): Step => ({ kind: 'wait', ...o });
const act = (label: string, operations: Array<Record<string, unknown>>): Step =>
  ({ kind: 'action', label, operations });
const handoff = (text: string): Step => ({ kind: 'handoff', text });
const done = (text: string): Step => ({ kind: 'end', text });

/**
 * Builds a straight-line flow from a list of steps.
 *
 * A question with choices gets one edge per choice and one for anything typed,
 * all leading to the same next step. The branches exist so an author can point
 * them somewhere different later; until then the customer simply taps instead
 * of typing, and the answer is saved either way.
 */
function linear(
  meta: Pick<FlowTemplate, 'id' | 'name' | 'description' | 'icon'> & { vertical: string },
  trigger: { type: 'keyword' | 'first_message'; value: string | null },
  steps: Step[],
): FlowTemplate & { vertical: string } {
  const id = (i: number) => `${meta.id}-${i}`;
  const nodes: FlowNode[] = [{
    id: id(0),
    type: 'start',
    position: { x: 250, y: 50 },
    data: {
      label: trigger.type === 'keyword' ? `Says “${trigger.value}”` : 'First message',
      triggerType: trigger.type,
      triggerValue: trigger.value ?? '',
    },
  } as unknown as FlowNode];
  const edges: FlowEdge[] = [];

  steps.forEach((step, i) => {
    const nodeId = id(i + 1);
    const position = { x: 250, y: 50 + (i + 1) * 150 };
    let node: FlowNode;

    switch (step.kind) {
      case 'message':
        node = { id: nodeId, type: 'message', position, data: { label: 'Message', message: step.text } } as unknown as FlowNode;
        break;
      case 'ask':
        node = {
          id: nodeId, type: 'question', position,
          data: {
            label: 'Question',
            message: step.text,
            timeoutHours: 48,
            ...(step.saveAs ? { saveAsVariable: step.saveAs } : {}),
            ...(step.choices
              ? {
                  answerMode: step.choices.length > 3 ? 'list' : 'buttons',
                  choices: step.choices.map((title, c) => ({ id: `c${c}`, title })),
                  ...(step.choices.length > 3 ? { listButtonText: 'Choose' } : {}),
                }
              : {}),
          },
        } as unknown as FlowNode;
        break;
      case 'wait':
        node = {
          id: nodeId, type: 'wait', position,
          data: { label: 'Wait', mode: 'duration', hours: step.hours ?? 0, days: step.days ?? 0 },
        } as unknown as FlowNode;
        break;
      case 'action':
        node = { id: nodeId, type: 'action', position, data: { label: step.label, operations: step.operations } } as unknown as FlowNode;
        break;
      case 'handoff':
        node = { id: nodeId, type: 'assign_agent', position, data: { label: 'Handoff to Agent', message: step.text } } as unknown as FlowNode;
        break;
      case 'end':
        node = { id: nodeId, type: 'end', position, data: { label: 'End', message: step.text } } as unknown as FlowNode;
        break;
    }

    nodes.push(node);

    const from = id(i);
    const prev = steps[i - 1];
    if (prev?.kind === 'ask' && prev.choices) {
      prev.choices.forEach((_, c) => {
        edges.push({ id: `e-${from}-${nodeId}-c${c}`, source: from, target: nodeId, sourceHandle: `choice_c${c}` } as unknown as FlowEdge);
      });
      edges.push({ id: `e-${from}-${nodeId}-other`, source: from, target: nodeId, sourceHandle: 'other' } as unknown as FlowEdge);
    } else {
      edges.push({ id: `e-${from}-${nodeId}`, source: from, target: nodeId } as unknown as FlowEdge);
    }
  });

  return {
    id: meta.id,
    name: meta.name,
    description: meta.description,
    icon: meta.icon,
    vertical: meta.vertical,
    trigger_type: trigger.type,
    trigger_value: trigger.value,
    nodes,
    edges,
  };
}

export const VERTICAL_TEMPLATES: Array<FlowTemplate & { vertical: string }> = [
  linear(
    { id: 'gym-trial', name: 'Gym — book a free trial', description: 'Qualify a walk-in enquiry and book a visit', icon: '🏋️', vertical: 'Gym & Fitness' },
    { type: 'keyword', value: 'Know More' },
    [
      msg('Hi! 👋 Welcome to our gym.\n\nHum aapki fitness journey shuru karne me madad karenge.'),
      ask('Aap kis cheez me interested hai?', 'goal', ['Weight loss', 'Muscle gain', 'General fitness']),
      ask('Great! Aapka naam kya hai?', 'name'),
      ask('{{name}}, aap kis din visit karna chahenge?', 'day'),
      act('Mark as a hot lead', [{ type: 'add_tags', tags: ['trial-requested'] }, { type: 'set_temperature', temperature: 'hot' }]),
      handoff('Perfect, {{name}}! 🙌 Humari team aapko {{day}} ke slot confirm karne ke liye abhi call karegi.'),
    ],
  ),

  linear(
    { id: 'clinic-appointment', name: 'Clinic — book an appointment', description: 'Take the department, name and preferred day', icon: '🏥', vertical: 'Clinic & Hospital' },
    { type: 'keyword', value: 'Book Appointment' },
    [
      msg('Namaste 🙏 Appointment book karne ke liye dhanyavaad.'),
      ask('Aapko kis department me dikhana hai?', 'department', ['General Physician', 'Dental', 'Orthopaedic', 'Gynaecology', 'Child Specialist']),
      ask('Patient ka naam bataiye.', 'name'),
      ask('Kis din aana chahenge? (jaise: kal, Monday, 5 November)', 'day'),
      act('Tag the enquiry', [{ type: 'add_tags', tags: ['appointment-request'] }]),
      handoff('Dhanyavaad {{name}}! 🙏 {{department}} ke liye {{day}} ka slot confirm karke hum aapko turant batate hai.'),
    ],
  ),

  linear(
    { id: 'spa-booking', name: 'Salon & Spa — service booking', description: 'Show the service menu and take a booking', icon: '💆', vertical: 'Salon & Spa' },
    { type: 'keyword', value: 'Book Now' },
    [
      msg('Hello! ✨ Aaj aap kaise relax karna chahenge?'),
      ask('Kaun si service lena chahenge?', 'service', ['Massage (60 min)', 'Massage (90 min)', 'Facial', 'Hair & Spa', 'Something else']),
      ask('Aapka naam?', 'name'),
      ask('Kis din aur kitne baje aana chahenge?', 'slot'),
      handoff('Thank you {{name}}! 💐 {{service}} ke liye {{slot}} ka slot check karke hum abhi confirm karte hai.'),
    ],
  ),

  linear(
    { id: 'resort-enquiry', name: 'Resort — availability enquiry', description: 'Take dates and guest count before handing over', icon: '🏖️', vertical: 'Hotel & Resort' },
    { type: 'keyword', value: 'Check Availability' },
    [
      msg('Greetings! 🌴 Humare resort me aapka swagat hai.'),
      ask('Aap kitne guests ke liye dekh rahe hai?', 'guests', ['1–2', '3–4', '5 or more']),
      ask('Check-in aur check-out ki tareekh bataiye. (jaise: 12 Nov to 14 Nov)', 'dates'),
      ask('Aapka naam?', 'name'),
      act('Tag the enquiry', [{ type: 'add_tags', tags: ['booking-enquiry'] }, { type: 'set_temperature', temperature: 'warm' }]),
      handoff('Dhanyavaad {{name}}! 🙏 {{guests}} guests ke liye {{dates}} ki availability aur best rate hum abhi bhejte hai.'),
    ],
  ),

  linear(
    { id: 'd2c-product', name: 'D2C — product enquiry', description: 'Answer a product question and route to a human', icon: '🛍️', vertical: 'Jewellery & D2C' },
    { type: 'keyword', value: 'Shop Now' },
    [
      msg('Hi! 🛍️ Humare products me interest lene ke liye shukriya.'),
      ask('Aap kya dhoondh rahe hai?', 'interest', ['New arrivals', 'Best sellers', 'Offers', 'Order status']),
      ask('Aapka naam bataiye.', 'name'),
      act('Tag the interest', [{ type: 'add_tags', tags: ['product-enquiry'] }]),
      handoff('Thank you {{name}}! ✨ {{interest}} ke options humari team abhi aapko bhej rahi hai.'),
    ],
  ),

  linear(
    { id: 'realestate-qualify', name: 'Real estate — qualify a buyer', description: 'Budget, location and timeline before a site visit', icon: '🏠', vertical: 'Real Estate' },
    { type: 'keyword', value: 'Enquire Now' },
    [
      msg('Namaste 🙏 Property me interest lene ke liye dhanyavaad.'),
      ask('Aapka budget kitna hai?', 'budget', ['Under ₹50 lakh', '₹50 lakh – 1 crore', 'Above ₹1 crore']),
      ask('Kaun se area me dekh rahe hai?', 'area'),
      ask('Kitne time me lena chahte hai?', 'timeline', ['This month', '2–3 months', 'Just exploring']),
      ask('Aapka naam?', 'name'),
      act('Score the lead', [{ type: 'add_tags', tags: ['site-visit-lead'] }, { type: 'create_task', title: 'Call {{name}} about {{area}}', dueInHours: 4 }]),
      handoff('Dhanyavaad {{name}}! 🏠 {{area}} me {{budget}} ke options humari team aapko bhejegi aur site visit plan karegi.'),
    ],
  ),

  linear(
    { id: 'coaching-demo', name: 'Coaching — book a demo class', description: 'Course, class and a follow-up two days later', icon: '🎓', vertical: 'Coaching & School' },
    { type: 'keyword', value: 'Free Demo' },
    [
      msg('Hello! 🎓 Free demo class ke liye enquiry karne ka shukriya.'),
      ask('Student kis class me hai?', 'grade', ['Class 6–8', 'Class 9–10', 'Class 11–12', 'Competitive exam']),
      ask('Kaun sa subject chahiye?', 'subject'),
      ask('Student ka naam?', 'name'),
      handoff('Thank you! 📚 {{name}} ke liye {{subject}} ki demo class ka time humari team abhi confirm karegi.'),
    ],
  ),

  linear(
    { id: 'software-demo', name: 'Software — book a demo', description: 'Qualify by team size, then follow up if they go quiet', icon: '💻', vertical: 'Software & Services' },
    { type: 'keyword', value: 'Book Demo' },
    [
      msg('Hi! 👋 Humare software ka demo dekhne ke liye shukriya.'),
      ask('Aapki team me kitne log hai?', 'team_size', ['1–10', '11–50', '50+']),
      ask('Aapka naam aur business ka naam bataiye.', 'name'),
      ask('Demo ke liye kaun sa din theek rahega?', 'day'),
      act('Tag and assign', [{ type: 'add_tags', tags: ['demo-requested'] }, { type: 'set_temperature', temperature: 'hot' }]),
      msg('Perfect {{name}}! 🙌 {{day}} ke liye demo set kar rahe hai.'),
      // 20 hours, not two days: WhatsApp only allows a free-form message within
      // 24 hours of the customer's last one. A reminder further out needs an
      // approved template, which has no step yet — so this template does not
      // teach a follow-up that would never arrive.
      wait({ hours: 20 }),
      done('Sirf yaad dila rahe hai — aapka demo pending hai. Koi sawal ho to yahi reply kar dijiye. 😊'),
    ],
  ),
];
