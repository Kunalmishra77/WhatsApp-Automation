import { describe, expect, it } from 'vitest';
import { detectMessageLanguage, languageDirective } from '../lib/ai-reply';

describe('detectMessageLanguage — native scripts (Unicode ranges)', () => {
  it('detects Tamil', () => {
    expect(detectMessageLanguage('எனக்கு டாக்டரிடம் நேரம் வேண்டும்')).toBe('tamil');
  });
  it('detects Telugu', () => {
    expect(detectMessageLanguage('నాకు డాక్టర్ అపాయింట్మెంట్ కావాలి')).toBe('telugu');
  });
  it('detects Kannada', () => {
    expect(detectMessageLanguage('ನನಗೆ ವೈದ್ಯರ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ಬೇಕು')).toBe('kannada');
  });
  it('detects Bengali', () => {
    expect(detectMessageLanguage('আমার ডাক্তার দেখানোর জন্য অ্যাপয়েন্টমেন্ট দরকার')).toBe('bengali');
  });
  it('classifies Devanagari (Hindi or Marathi) as devanagari', () => {
    expect(detectMessageLanguage('मुझे डॉक्टर से मिलना है')).toBe('devanagari');   // Hindi
    expect(detectMessageLanguage('मला डॉक्टरांची अपॉइंटमेंट हवी आहे')).toBe('devanagari'); // Marathi
  });
});

describe('detectMessageLanguage — Latin script', () => {
  it('detects plain English', () => {
    expect(detectMessageLanguage('I need an appointment please')).toBe('english');
  });
  it('detects Hinglish (romanized Hindi)', () => {
    expect(detectMessageLanguage('Mujhe kal appointment book karni hai')).toBe('hinglish');
  });
  it('returns null for a truly ambiguous short input', () => {
    expect(detectMessageLanguage('ok')).toBeNull();
  });
  it('ignores bracketed system/button tags', () => {
    expect(detectMessageLanguage('[Tapped button: "Book Your Slot"]')).toBeNull();
  });
});

describe('languageDirective', () => {
  it('returns empty string when language is null (defer to model)', () => {
    expect(languageDirective(null)).toBe('');
  });
  it('names each native language in its directive', () => {
    expect(languageDirective('tamil')).toMatch(/Tamil/);
    expect(languageDirective('telugu')).toMatch(/Telugu/);
    expect(languageDirective('kannada')).toMatch(/Kannada/);
    expect(languageDirective('bengali')).toMatch(/Bengali/);
  });
  it('does NOT force Devanagari to Hindi (must allow Marathi)', () => {
    const d = languageDirective('devanagari');
    expect(d).toMatch(/Marathi/);
    expect(d).toMatch(/Hindi/);
  });
  it('keeps Hinglish in Roman script, not pure English or Devanagari', () => {
    const d = languageDirective('hinglish');
    expect(d).toMatch(/Hinglish/i);
    expect(d).toMatch(/Roman/i);
  });
});
