// form fields, edit this to change the form n pdf

export const COMPLAINT_FIELDS = [
  {
    id: 'tajuk',
    section: 'aduan',
    required: true,
    maxLength: 200,
    rows: 3,
    label: { ms: 'Tajuk', en: 'Title' },
    placeholder: {
      ms: 'Contoh: Gelanggang badminton tidak boleh digunakan walaupun projek telah siap',
      en: 'E.g. Badminton court unusable even though the project is complete',
    },
  },
  {
    id: 'apa',
    section: 'aduan',
    required: true,
    rows: 8,
    label: { ms: 'Apa yang berlaku?', en: 'What happened?' },
    placeholder: {
      ms: 'Huraikan perkara yang berlaku secara terperinci.',
      en: 'Describe in detail what happened.',
    },
  },
  {
    id: 'bila',
    section: 'aduan',
    required: true,
    rows: 3,
    label: { ms: 'Bila kejadian berlaku?', en: 'When did it happen?' },
    placeholder: {
      ms: 'Contoh: 18 September 2025, jam 3.00 petang',
      en: 'E.g. 18 September 2025, 3.00 pm',
    },
  },
  {
    id: 'dimana',
    section: 'aduan',
    required: true,
    rows: 3,
    label: { ms: 'Di mana kejadian berlaku?', en: 'Where did it happen?' },
    placeholder: {
      ms: 'Contoh: Dewan Serbaguna Taman Seri Mawar',
      en: 'E.g. Taman Seri Mawar Community Hall',
    },
  },
  {
    id: 'bagaimana',
    section: 'aduan',
    required: true,
    rows: 5,
    label: { ms: 'Bagaimana dilakukan?', en: 'How was it done?' },
    placeholder: {
      ms: 'Terangkan bagaimana perbuatan tersebut dilakukan.',
      en: 'Explain how it was carried out.',
    },
  },
  {
    id: 'kenapa',
    section: 'aduan',
    required: true,
    rows: 4,
    label: { ms: 'Kenapa dilakukan?', en: 'Why was it done?' },
    placeholder: {
      ms: 'Nyatakan sebab atau motif perbuatan tersebut, jika diketahui.',
      en: 'State the reason or motive, if known.',
    },
  },
  {
    id: 'siapa',
    section: 'aduan',
    required: true,
    rows: 2,
    label: { ms: 'Nama yang diadu?', en: 'Name of the person complained about?' },
    placeholder: {
      ms: 'Nama penuh individu atau pihak yang diadu.',
      en: 'Full name of the person or party complained about.',
    },
  },
  {
    id: 'ulasan',
    section: 'ulasan',
    required: true,
    rows: 4,
    label: { ms: 'Ulasan Pegawai Negeri/Cawangan', en: 'State/Branch Officer Remarks' },
    placeholder: {
      ms: 'Ulasan dan cadangan tindakan oleh pegawai negeri/cawangan.',
      en: 'Remarks and recommended action by the state/branch officer.',
    },
  },
]

export const EMPTY_FORM = {
  priority: false,
  ...Object.fromEntries(COMPLAINT_FIELDS.map((field) => [field.id, ''])),
}

// returns invalid fields
export function validateForm(form) {
  const errors = {}
  for (const field of COMPLAINT_FIELDS) {
    const value = String(form[field.id] ?? '').trim()
    if (field.required && !value) errors[field.id] = 'required'
    else if (field.maxLength && value.length > field.maxLength) errors[field.id] = 'max'
  }
  return errors
}
