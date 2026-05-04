import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

import User from '../src/models/User';
import TechnicianProfile from '../src/models/TechnicianProfile';
import Category from '../src/models/Category';
import Service from '../src/models/Service';
import Booking from '../src/models/Booking';
import Message from '../src/models/Message';
import Review from '../src/models/Review';
import Payment from '../src/models/Payment';
import Notification from '../src/models/Notification';
import {
  BookingStatus, PaymentStatus, UserRole,
  TechnicianType, DocumentType,
} from '../src/types';

const MONGO_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/smartfix';

async function seed(): Promise<void> {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  // ── Clear all collections (idempotent) ──────────────────────────────────────
  await Promise.all([
    User.deleteMany({}),
    TechnicianProfile.deleteMany({}),
    Category.deleteMany({}),
    Service.deleteMany({}),
    Booking.deleteMany({}),
    Message.deleteMany({}),
    Review.deleteMany({}),
    Payment.deleteMany({}),
    Notification.deleteMany({}),
  ]);
  console.log('🗑️  Collections cleared');

  // ── Categories (one per TechnicianType) ─────────────────────────────────────
  const [
    plumbingCat, electricityCat, paintingCat, carpentryCat, conditioningCat,
  ] = await Category.insertMany([
    {
      name: 'Plumbing',
      technicianType: TechnicianType.Plumbing,
      icon: '🔧',
      description: 'Pipe repair, leak detection, water heaters, bathroom fixtures',
      isActive: true,
    },
    {
      name: 'Electricity',
      technicianType: TechnicianType.Electricity,
      icon: '⚡',
      description: 'Wiring, socket installation, circuit breakers, lighting',
      isActive: true,
    },
    {
      name: 'Painting',
      technicianType: TechnicianType.Painting,
      icon: '🎨',
      description: 'Interior and exterior painting, wallpaper, surface preparation',
      isActive: true,
    },
    {
      name: 'Carpentry',
      technicianType: TechnicianType.Carpentry,
      icon: '🪚',
      description: 'Furniture repair, door fitting, shelving, custom woodwork',
      isActive: true,
    },
    {
      name: 'Air Conditioning',
      technicianType: TechnicianType.Conditioning,
      icon: '❄️',
      description: 'AC installation, repair, maintenance, cleaning',
      isActive: true,
    },
  ]);
  console.log('📁 Categories created (5)');

  // ── Services ─────────────────────────────────────────────────────────────────
  const [
    fixLeak, installPipe, waterHeater,          // plumbing
    installSocket, wiringCheck, breakerRepair,  // electricity
    roomPainting, exteriorPainting,             // painting
    doorFitting, shelvingInstall,               // carpentry
    acInstall, acService,                       // conditioning
  ] = await Service.insertMany([
    // ── Plumbing ──
    { categoryId: plumbingCat._id,      name: 'Fix Leak',              description: 'Professional pipe leak detection and repair',              price: 30,  durationMinutes: 60,  isActive: true },
    { categoryId: plumbingCat._id,      name: 'Pipe Installation',     description: 'Install new water pipes for kitchen or bathroom',          price: 80,  durationMinutes: 120, isActive: true },
    { categoryId: plumbingCat._id,      name: 'Water Heater Service',  description: 'Install or repair electric/gas water heaters',             price: 60,  durationMinutes: 90,  isActive: true },
    // ── Electricity ──
    { categoryId: electricityCat._id,   name: 'Install Socket',        description: 'Install or replace electrical socket safely',              price: 25,  durationMinutes: 45,  isActive: true },
    { categoryId: electricityCat._id,   name: 'Full Wiring Check',     description: 'Complete home electrical wiring safety inspection',        price: 60,  durationMinutes: 120, isActive: true },
    { categoryId: electricityCat._id,   name: 'Breaker Repair',        description: 'Diagnose and fix circuit breaker issues',                  price: 45,  durationMinutes: 60,  isActive: true },
    // ── Painting ──
    { categoryId: paintingCat._id,      name: 'Room Painting',         description: 'Interior room painting with premium paint',               price: 120, durationMinutes: 240, isActive: true },
    { categoryId: paintingCat._id,      name: 'Exterior Painting',     description: 'Exterior wall painting, weatherproof coating',            price: 200, durationMinutes: 480, isActive: true },
    // ── Carpentry ──
    { categoryId: carpentryCat._id,     name: 'Door Fitting',          description: 'Install or repair interior/exterior doors',                price: 55,  durationMinutes: 90,  isActive: true },
    { categoryId: carpentryCat._id,     name: 'Shelving Installation', description: 'Custom wall shelves and storage solutions',                price: 70,  durationMinutes: 120, isActive: true },
    // ── Conditioning ──
    { categoryId: conditioningCat._id,  name: 'AC Installation',       description: 'Install split or window AC unit, includes brackets',      price: 150, durationMinutes: 180, isActive: true },
    { categoryId: conditioningCat._id,  name: 'AC Service & Cleaning', description: 'Deep clean, refrigerant check, filter replacement',       price: 50,  durationMinutes: 90,  isActive: true },
  ]);
  console.log('🛠️  Services created (12)');

  // ── Users ────────────────────────────────────────────────────────────────────
  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash('Demo1234!', salt);

  const customer = await User.create({
    name: 'Ahmed Ali',
    email: 'customer@demo.com',
    phone: '+20-101-000-0001',
    passwordHash,
    role: UserRole.Customer,
    isVerified: true,
    isActive: true,
    addresses: [
      { label: 'Home',  lat: 30.0444, lng: 31.2357, isDefault: true  },
      { label: 'Work',  lat: 30.0561, lng: 31.2394, isDefault: false },
    ],
  });

  // 5 technicians — one per type
  const techPlumber = await User.create({
    name: 'Mohamed Hassan',
    email: 'tech.plumber@demo.com',
    phone: '+20-101-000-0002',
    passwordHash, role: UserRole.Technician, isVerified: true, isActive: true,
  });
  const techElectrician = await User.create({
    name: 'Karim Ibrahim',
    email: 'tech.electric@demo.com',
    phone: '+20-101-000-0003',
    passwordHash, role: UserRole.Technician, isVerified: true, isActive: true,
  });
  const techPainter = await User.create({
    name: 'Ali Mahmoud',
    email: 'tech.painter@demo.com',
    phone: '+20-101-000-0004',
    passwordHash, role: UserRole.Technician, isVerified: true, isActive: true,
  });
  const techCarpenter = await User.create({
    name: 'Omar Salah',
    email: 'tech.carpenter@demo.com',
    phone: '+20-101-000-0005',
    passwordHash, role: UserRole.Technician, isVerified: true, isActive: true,
  });
  const techAC = await User.create({
    name: 'Youssef Nasser',
    email: 'tech.ac@demo.com',
    phone: '+20-101-000-0006',
    passwordHash, role: UserRole.Technician, isVerified: true, isActive: true,
  });

  console.log('👤 Users created (1 customer + 5 technicians)');

  // ── Technician Profiles ───────────────────────────────────────────────────────
  await TechnicianProfile.insertMany([
    {
      userId: techPlumber._id,
      technicianType: TechnicianType.Plumbing,
      bio: 'Expert plumber with 8 years of experience. Specialized in leak repair, pipe installation, and water heater service.',
      skills: ['Pipe Repair', 'Leak Detection', 'Water Heaters', 'Bathroom Fixtures', 'Drain Cleaning'],
      experienceYears: 8,
      isOnline: true,
      currentLocation: { type: 'Point', coordinates: [31.2357, 30.0444] },
      rating: 4.8, totalReviews: 1, totalEarnings: 30,
    },
    {
      userId: techElectrician._id,
      technicianType: TechnicianType.Electricity,
      bio: 'Licensed electrician with 5 years of experience. Specialized in residential wiring, socket installation, and circuit breaker repair.',
      skills: ['Wiring', 'Socket Installation', 'Circuit Breakers', 'Lighting', 'Electrical Safety'],
      experienceYears: 5,
      documents: [{ type: DocumentType.Certification, url: 'https://res.cloudinary.com/demo/image/upload/sample.pdf', publicId: 'smartfix/documents/sample' }],
      isOnline: true,
      currentLocation: { type: 'Point', coordinates: [31.2400, 30.0500] },
      rating: 4.5, totalReviews: 0, totalEarnings: 0,
    },
    {
      userId: techPainter._id,
      technicianType: TechnicianType.Painting,
      bio: 'Professional painter with 6 years of experience. Interior and exterior painting, wallpaper installation, and surface preparation.',
      skills: ['Interior Painting', 'Exterior Painting', 'Wallpaper', 'Surface Prep', 'Texture Coating'],
      experienceYears: 6,
      isOnline: true,
      currentLocation: { type: 'Point', coordinates: [31.2300, 30.0380] },
      rating: 4.7, totalReviews: 0, totalEarnings: 0,
    },
    {
      userId: techCarpenter._id,
      technicianType: TechnicianType.Carpentry,
      bio: 'Skilled carpenter with 10 years of experience. Custom furniture, door fitting, shelving, and all woodwork repairs.',
      skills: ['Door Fitting', 'Custom Furniture', 'Shelving', 'Wood Repair', 'Cabinet Making'],
      experienceYears: 10,
      isOnline: false,
      currentLocation: { type: 'Point', coordinates: [31.2450, 30.0600] },
      rating: 4.9, totalReviews: 0, totalEarnings: 0,
    },
    {
      userId: techAC._id,
      technicianType: TechnicianType.Conditioning,
      bio: 'Certified AC technician with 7 years of experience. AC installation, repair, deep cleaning, and maintenance for all brands.',
      skills: ['AC Installation', 'AC Repair', 'AC Cleaning', 'Refrigerant Handling', 'Duct Work'],
      experienceYears: 7,
      documents: [{ type: DocumentType.Certification, url: 'https://res.cloudinary.com/demo/image/upload/sample.pdf', publicId: 'smartfix/documents/ac_cert' }],
      isOnline: true,
      currentLocation: { type: 'Point', coordinates: [31.2200, 30.0350] },
      rating: 4.6, totalReviews: 0, totalEarnings: 0,
    },
  ]);
  console.log('🔨 Technician profiles created (5 — one per type)');

  // ── Bookings ──────────────────────────────────────────────────────────────────
  const completedBooking = await Booking.create({
    customerId: customer._id,
    technicianId: techPlumber._id,
    serviceId: fixLeak._id,
    addressSnapshot: { label: 'Home', lat: 30.0444, lng: 31.2357 },
    scheduledAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    notes: 'Kitchen sink dripping badly, needs urgent fix',
    status: BookingStatus.Completed,
    invoice: { amount: 30, breakdown: [{ label: 'Fix Leak', amount: 30 }] },
  });

  const acceptedBooking = await Booking.create({
    customerId: customer._id,
    technicianId: techElectrician._id,
    serviceId: installSocket._id,
    addressSnapshot: { label: 'Home', lat: 30.0444, lng: 31.2357 },
    scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    notes: 'Need a new socket installed in the living room',
    status: BookingStatus.Accepted,
    invoice: { amount: 25, breakdown: [{ label: 'Install Socket', amount: 25 }] },
  });

  const pendingBooking = await Booking.create({
    customerId: customer._id,
    technicianId: techAC._id,
    serviceId: acService._id,
    addressSnapshot: { label: 'Home', lat: 30.0444, lng: 31.2357 },
    scheduledAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    notes: 'AC making noise and not cooling properly',
    status: BookingStatus.Pending,
    invoice: { amount: 50, breakdown: [{ label: 'AC Service & Cleaning', amount: 50 }] },
  });

  const pendingPainting = await Booking.create({
    customerId: customer._id,
    technicianId: techPainter._id,
    serviceId: roomPainting._id,
    addressSnapshot: { label: 'Home', lat: 30.0444, lng: 31.2357 },
    scheduledAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    notes: 'Paint master bedroom and living room, white color',
    status: BookingStatus.Pending,
    invoice: { amount: 120, breakdown: [{ label: 'Room Painting', amount: 120 }] },
  });

  console.log('📅 Bookings created (4)');

  // ── Messages ──────────────────────────────────────────────────────────────────
  await Message.insertMany([
    { bookingId: completedBooking._id, senderId: customer._id,    type: 'text', content: 'Hi, the kitchen sink has been leaking for 2 days now.',                                     isRead: true },
    { bookingId: completedBooking._id, senderId: techPlumber._id, type: 'text', content: 'Got it! I will be there at the scheduled time. Please have the water shut-off valve accessible.', isRead: true },
    { bookingId: completedBooking._id, senderId: customer._id,    type: 'text', content: 'Sure, it is under the sink. See you then!',                                                 isRead: true },
    { bookingId: completedBooking._id, senderId: techPlumber._id, type: 'text', content: 'I am on my way, should be there in about 15 minutes.',                                      isRead: true },
    { bookingId: completedBooking._id, senderId: techPlumber._id, type: 'text', content: 'Job complete! The pipe fitting was worn out. Replaced it and tested — no more leaks.',       isRead: true },
    // accepted booking chat
    { bookingId: acceptedBooking._id,  senderId: customer._id,        type: 'text', content: 'When will you arrive tomorrow?',                isRead: true },
    { bookingId: acceptedBooking._id,  senderId: techElectrician._id, type: 'text', content: 'I will be there at 10 AM sharp.',              isRead: false },
  ]);
  console.log('💬 Messages created (7)');

  // ── Review ────────────────────────────────────────────────────────────────────
  await Review.create({
    bookingId: completedBooking._id,
    customerId: customer._id,
    technicianId: techPlumber._id,
    rating: 5,
    comment: 'Mohamed was professional and fixed the leak quickly. Highly recommend!',
    editWindowExpires: new Date(Date.now() - 24 * 60 * 60 * 1000), // already expired
  });
  console.log('⭐ Review created');

  // ── Payment ───────────────────────────────────────────────────────────────────
  await Payment.create({
    bookingId: completedBooking._id,
    customerId: customer._id,
    amount: 30,
    currency: 'usd',
    method: 'card',
    status: PaymentStatus.Success,
    gatewayRef: 'demo_seed_payment_001',
  });
  console.log('💳 Payment created');

  // ── Notifications ─────────────────────────────────────────────────────────────
  await Notification.insertMany([
    { userId: customer._id,        title: 'Booking Accepted',      body: 'Karim Ibrahim accepted your Install Socket booking',    type: 'booking_accepted',  refId: acceptedBooking._id,  isRead: false },
    { userId: customer._id,        title: 'Job Completed',         body: 'Your Fix Leak booking has been marked complete',         type: 'booking_completed', refId: completedBooking._id, isRead: true  },
    { userId: techPlumber._id,     title: 'New Booking Request',   body: 'Ahmed Ali requested Fix Leak',                          type: 'booking_request',   refId: completedBooking._id, isRead: true  },
    { userId: techElectrician._id, title: 'New Booking Request',   body: 'Ahmed Ali requested Install Socket',                    type: 'booking_request',   refId: acceptedBooking._id,  isRead: true  },
    { userId: techAC._id,          title: 'New Booking Request',   body: 'Ahmed Ali requested AC Service & Cleaning',             type: 'booking_request',   refId: pendingBooking._id,   isRead: false },
    { userId: techPainter._id,     title: 'New Booking Request',   body: 'Ahmed Ali requested Room Painting',                     type: 'booking_request',   refId: pendingPainting._id,  isRead: false },
    { userId: customer._id,        title: 'Payment Confirmed',     body: 'Payment of $30 confirmed for Fix Leak',                 type: 'payment_confirmed', refId: completedBooking._id, isRead: true  },
  ]);
  console.log('🔔 Notifications created (7)');

  console.log('\n══════════════════════════════════════════════════════');
  console.log('✅  Seed complete!');
  console.log('══════════════════════════════════════════════════════');
  console.log('  👤 Customer:          customer@demo.com    / Demo1234!');
  console.log('  🔧 Plumber:           tech.plumber@demo.com  / Demo1234!');
  console.log('  ⚡ Electrician:       tech.electric@demo.com / Demo1234!');
  console.log('  🎨 Painter:           tech.painter@demo.com  / Demo1234!');
  console.log('  🪚 Carpenter:         tech.carpenter@demo.com/ Demo1234!');
  console.log('  ❄️  AC Technician:    tech.ac@demo.com       / Demo1234!');
  console.log('────────────────────────────────────────────────────────');
  console.log('  Bookings:');
  console.log('    Completed (plumbing):    ', completedBooking._id.toString());
  console.log('    Accepted  (electricity): ', acceptedBooking._id.toString());
  console.log('    Pending   (AC):          ', pendingBooking._id.toString());
  console.log('    Pending   (painting):    ', pendingPainting._id.toString());
  console.log('══════════════════════════════════════════════════════\n');

  await mongoose.disconnect();
}

seed().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('❌ Seed error:', message);
  process.exit(1);
});
