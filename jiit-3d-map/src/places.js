// Curated places for first-year students.
// Facts come from OpenStreetMap tags (descriptions, opening hours) and JIIT's public
// infrastructure sheet. Floor counts marked "approx" are estimates for the 3D model.

export const CATEGORIES = {
  academic: { label: 'Academic', icon: 'cap', color: '#f59e0b' },
  hostel: { label: 'Hostels', icon: 'bed', color: '#a78bfa' },
  food: { label: 'Food & Shops', icon: 'utensils', color: '#f87171' },
  sports: { label: 'Sports', icon: 'field', color: '#34d399' },
  culture: { label: 'Clubs & Events', icon: 'stage', color: '#facc15' },
  gate: { label: 'Gates & Parking', icon: 'gate', color: '#60a5fa' },
  other: { label: 'Other', icon: 'pin', color: '#cbd5e1' },
};

// osm: building/area way or relation id; node: OSM node id for point places.
// floors: model floors; style: facade style for buildings.
export const PLACES = [
  {
    id: 'abb1', name: 'ABB-1', full: 'Aryabhata Bhawan 1', cat: 'academic', icon: 'landmark', osm: 608015617, floors: 4, style: 'academic',
    desc: 'The main academic block of JIIT Sector 62: classrooms, tutorial rooms, labs and faculty cabins along a long north–south spine.',
    tips: ['Most first-year lectures, tutorials and labs are likely to be here. Your timetable gives the exact room codes.', 'Walk the building once during orientation week so you can find rooms fast between back-to-back classes.'],
    tour: 'This long block is ABB-1, where you will probably spend most of your first year in lectures, tutorials and labs.',
  },
  {
    id: 'abb3', name: 'ABB-3', full: 'Aryabhata Bhawan 3 (tower)', cat: 'academic', icon: 'tower', osm: 1472996506, floors: 19, style: 'tower', special: 'tower',
    desc: 'The campus landmark tower. It has hostel floors and the administration office. There is a café on the ground floor, and the library (LRC) and two computer labs are in the basement.',
    tips: ['Fees, ID cards and other admin work is usually handled in the admin offices here.', 'The "Portico" passage at ground level links the gate side with the inner campus.'],
    tour: 'The tall tower is ABB-3. It holds the administration offices and hostel floors, and the library (LRC) is in its basement.',
  },
  {
    id: 'lrc', name: 'LRC · Library', full: 'Learning Resource Centre', cat: 'academic', icon: 'book', at: 'abb3', offset: [6, 0, -18], minor: true,
    desc: 'The Learning Resource Centre (central library) is in the basement of ABB-3, next to two computer labs.',
    tips: ['Keep your college ID with you; libraries normally need it to issue books.', 'It is a quiet place to study between classes.'],
  },
  {
    id: 'abb2', name: 'ABB-2', full: 'Aryabhata Bhawan 2 · Auditorium & JBS', cat: 'academic', icon: 'mic', osm: 608015633, floors: 5, style: 'business',
    desc: 'Holds the main auditorium together with the Jaypee Business School (JBS) building.',
    tips: ['Orientation sessions, guest talks and large events are often held in the auditorium.'],
    tour: 'ABB-2 holds the auditorium, where orientation and big events usually happen, plus the Jaypee Business School.',
  },
  {
    id: 'oat', name: 'OAT', full: 'Open Air Theatre', cat: 'culture', icon: 'stage', osm: 608015612, special: 'oat',
    desc: 'The open-air stage of JIIT, used for fests, club performances, concerts and cultural nights.',
    tips: ['Watch club notice boards and social pages for events here, especially during fest season.'],
    tour: 'The Open Air Theatre faces the ground. Cultural nights, club shows and fest performances happen here.',
  },
  {
    id: 'ground', name: 'Main Ground', full: 'Central Ground & Courts', cat: 'sports', icon: 'field', osm: 608015613,
    desc: 'The central playing ground, surrounded by covered corridors. Basketball, volleyball and badminton courts are right next to it.',
    tips: ['The covered corridors around the ground are a shaded shortcut between ABB-1 and ABB-3.'],
    tour: 'This is the heart of the campus: the ground, the courts and the covered corridors around them.',
  },
  { id: 'basketball', name: 'Basketball Court', cat: 'sports', icon: 'basketball', osm: 608015616, minor: true, desc: 'A floodlit concrete basketball court with two hoops.' },
  { id: 'badminton', name: 'Badminton Court', cat: 'sports', icon: 'shuttle', osm: 608015618, minor: true, desc: 'A floodlit open badminton court.' },
  { id: 'volleyball', name: 'Volleyball Court', cat: 'sports', icon: 'volleyball', osm: 608015636, minor: true, desc: 'A floodlit concrete volleyball court. There is a second, dirt court beside the ground.' },
  { id: 'playfield', name: 'Common Play Field', cat: 'sports', icon: 'goal', osm: 608015615, minor: true, desc: 'A floodlit multi-sport concrete play area.' },
  {
    id: 'pool', name: 'Swimming Pool', cat: 'sports', icon: 'waves', osm: 608015639,
    desc: 'The campus swimming pool, with separate timings for different groups.',
    tips: ['Ask the sports office about timings and registration.'],
  },
  {
    id: 'mess', name: 'Annapurna Mess', full: 'Annapurna Mess & Dining', cat: 'food', icon: 'utensils', osm: 608015638, floors: 2, style: 'hostel2',
    hours: [['07:00', '09:00', 'Breakfast'], ['12:00', '14:30', 'Lunch'], ['19:30', '21:00', 'Dinner']],
    desc: 'The main dining hall and mess serving Indian meals. Solar panels sit on the rooftops next to it.',
    tips: ['Meal timings below come from OpenStreetMap and may change. Check the notice board at the mess.'],
    tour: 'Annapurna is the mess. Breakfast, lunch and dinner are served here at fixed times.',
  },
  {
    id: 'cafe', name: 'Annapurna Café', cat: 'food', icon: 'coffee', node: 5761115039,
    desc: 'A café near ABB-3, handy between classes. Card and UPI accepted (according to OpenStreetMap).',
  },
  { id: 'a2z', name: 'A2Z Store', cat: 'food', icon: 'cart', node: 5761115006, minor: true, desc: 'A convenience store inside the campus that accepts card and UPI.' },
  {
    id: 'sac', name: 'SAC', full: 'Student Activity Centre', cat: 'culture', icon: 'palette', node: 5761115008,
    desc: 'Activity rooms for student clubs and hubs, including the μCR Hub room. A girls\' gym is next door.',
    tips: ['Club recruitments usually start in the first few weeks. This is where many clubs meet.'],
    tour: 'The Student Activity Centre is where clubs and hubs meet. Join a few in your first semester.',
  },
  { id: 'gym', name: "Girls' Gym", cat: 'sports', icon: 'dumbbell', node: 5761115014, minor: true, desc: 'A fitness centre next to the Student Activity Centre.' },
  { id: 'mandir', name: 'Mandir', full: 'Campus Temple', cat: 'other', icon: 'temple', osm: 608015619, special: 'mandir', desc: 'A small Hindu temple inside the campus.' },
  { id: 'sarojini', name: 'Sarojini Bhawan', cat: 'hostel', icon: 'bed', osm: 608015634, floors: 4, style: 'hostel', desc: 'A student hostel. No smoking; Wi-Fi available.' },
  { id: 'rajendra', name: 'Rajendra Bhawan', cat: 'hostel', icon: 'bed', osm: 608015620, floors: 11, style: 'hostel', approx: true, desc: 'A student hostel with about 432 rooms (according to OpenStreetMap). No smoking; Wi-Fi available.' },
  { id: 'h4', name: 'H4', full: 'Hostel H4', cat: 'hostel', icon: 'bed', osm: 608015645, floors: 11, style: 'hostel2', approx: true, desc: 'A student hostel block in the east of the campus.' },
  { id: 'h5', name: 'H5', full: 'Hostel H5', cat: 'hostel', icon: 'bed', osm: 608015640, floors: 11, style: 'hostel2', approx: true, desc: 'A student hostel block near the back gate. No smoking; Wi-Fi available.' },
  { id: 'n7', name: 'N7', full: 'Hostel N7', cat: 'hostel', icon: 'bed', osm: 1351752936, floors: 6, style: 'hostel', approx: true, desc: 'A hostel block. The Student Activity Centre, girls\' gym and A2Z store are around its ground floor.' },
  {
    id: 'faculty', name: "Teachers' Residence", full: "Teachers' Residence (faculty housing)", cat: 'other', icon: 'residence', osm: 5262993, floors: 3, style: 'residence',
    desc: 'Housing for teachers, built around a central courtyard between the Mandir and Rajendra Bhawan. Small parks with benches fill the open bays on both sides.',
    tips: ['This is a residential area, so please keep the noise down.'],
  },
  {
    id: 'gate1', name: 'Gate 1', full: 'Gate Number 1 (main)', cat: 'gate', icon: 'gate', node: 13304450800,
    desc: 'The north-west entrance next to ABB-3. It is the most likely way in on your first day.',
    tour: 'Welcome! Most freshers enter through Gate 1, right beside the ABB-3 tower.',
  },
  { id: 'gate2', name: 'Gate 2', full: 'Gate Number 2', cat: 'gate', icon: 'gate', node: 5761115022, desc: 'The north entrance near the top of ABB-1.' },
  {
    id: 'backgate', name: 'Gate 3', full: 'Gate Number 3 (back gate)', cat: 'gate', icon: 'walk', node: 11182505497, hours: [['07:00', '22:00', 'Open']],
    desc: 'Gate 3, also called the back gate, at the south-east corner. It is open to pedestrians and cycles. Motor vehicles need permission.',
    tips: ['Opening hours are from OpenStreetMap: 07:00–22:00 every day.'],
  },
  { id: 'parking', name: 'Underground Parking', cat: 'gate', icon: 'parking', node: 12506406980, minor: true, desc: 'The ramp to the supervised underground parking beneath the courts.' },
];

export const TOUR = ['gate1', 'abb3', 'ground', 'abb1', 'oat', 'abb2', 'mess', 'sac', 'pool', 'rajendra', 'backgate'];

// Extra floor counts for unnamed / surrounding buildings are randomised in world.js.
