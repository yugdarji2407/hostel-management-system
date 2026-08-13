import { PrismaClient } from '@prisma/client';
import { hashPassword, sha256 } from '../src/lib/security.js';
const prisma = new PrismaClient();
async function main() {
    if (process.env.NODE_ENV === 'production')
        throw new Error('Seed disabled in production');
    const college = await prisma.college.upsert({ where: { code: 'DEMO-ENG' }, update: {}, create: { name: 'Demo Engineering College', code: 'DEMO-ENG', city: 'Ahmedabad', state: 'Gujarat', country: 'India' } });
    const hostel = await prisma.hostel.upsert({ where: { code: 'KSV-DEMO' }, update: {}, create: { name: 'KSV Hostel', code: 'KSV-DEMO', timezone: 'Asia/Kolkata' } });
    const room = await prisma.room.upsert({ where: { hostelId_roomNumber: { hostelId: hostel.id, roomNumber: 'A-101' } }, update: {}, create: { hostelId: hostel.id, roomNumber: 'A-101', floor: '1', block: 'A', capacity: 3 } });
    const beds = await prisma.bed.findMany({ where: { roomId: room.id } });
    for (let i = beds.length + 1; i <= 3; i++)
        await prisma.bed.create({ data: { roomId: room.id, bedNumber: String(i), label: String(i) } });
    const user = await prisma.user.upsert({ where: { normalizedEmail: 'demo.student@example.com' }, update: {}, create: { email: 'demo.student@example.com', normalizedEmail: 'demo.student@example.com', passwordHash: await hashPassword('DemoPassword123!'), role: 'STUDENT', student: { create: { name: 'Demo Student', enrollmentId: 'KSV2026XXXX', phone: '9999999999', emailDisplay: 'demo.student@example.com', collegeId: college.id, course: 'Engineering', semester: 4, academicYear: '2026-27', hostelId: hostel.id, roomId: room.id, bedId: (await prisma.bed.findFirst({ where: { roomId: room.id } })).id, status: 'ACTIVE' } } } });
    await prisma.userSettings.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id } });
    const student = (await prisma.student.findUnique({ where: { userId: user.id } }));
    const bed = (await prisma.bed.findFirst({ where: { roomId: room.id } }));
    await prisma.hostelAllocation.upsert({ where: { publicId: '00000000-0000-0000-0000-000000000001' }, update: {}, create: { publicId: '00000000-0000-0000-0000-000000000001', studentId: student.id, hostelId: hostel.id, roomId: room.id, bedId: bed.id, startDate: new Date(), assignedBy: user.id } }).catch(() => { });
    await prisma.bed.update({ where: { id: bed.id }, data: { status: 'OCCUPIED' } });
    const existing = await prisma.device.findFirst({ where: { userId: user.id, status: 'APPROVED' } });
    if (!existing)
        await prisma.device.create({ data: { userId: user.id, serverDeviceId: sha256('demo-device'), deviceName: 'Chrome on Android', os: 'Android', browser: 'Chrome', ipAddress: '127.0.0.1', userAgentHash: sha256('demo'), status: 'APPROVED', approvedAt: new Date() } });
    for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setUTCHours(0, 0, 0, 0);
        d.setUTCDate(d.getUTCDate() - i);
        await prisma.attendance.upsert({ where: { studentId_attendanceDate: { studentId: student.id, attendanceDate: d } }, update: {}, create: { studentId: student.id, attendanceDate: d, status: i === 2 ? 'ABSENT' : 'PRESENT', markedByUserId: user.id, markedByRole: 'STUDENT', markedAt: new Date(), source: 'SYSTEM' } }).catch(() => { });
    }
    const menuStart = new Date();
    menuStart.setUTCHours(0, 0, 0, 0);
    const week = await prisma.messMenuWeek.findFirst({ where: { hostelId: hostel.id } });
    if (!week) {
        const w = await prisma.messMenuWeek.create({ data: { hostelId: hostel.id, weekStartDate: menuStart, weekEndDate: new Date(menuStart.getTime() + 6 * 86400000), status: 'PUBLISHED', createdBy: user.id } });
        for (let i = 0; i < 7; i++) {
            const day = await prisma.messMenuDay.create({ data: { weekId: w.id, date: new Date(menuStart.getTime() + i * 86400000), dayOfWeek: i + 1, specialNote: i === 6 ? 'Sunday special thali' : '' } });
            for (const [type, start, end, items] of [['BREAKFAST', '07:00', '09:00', ['Poha', 'Tea']], ['LUNCH', '12:30', '14:30', ['Dal', 'Rice', 'Roti']], ['DINNER', '19:30', '21:30', ['Sabji', 'Roti', 'Dal']]]) {
                const meal = await prisma.messMeal.create({ data: { dayId: day.id, type, startTime: start, endTime: end, title: type[0] + type.slice(1).toLowerCase() } });
                for (let j = 0; j < items.length; j++)
                    await prisma.messMealItem.create({ data: { mealId: meal.id, name: items[j], sortOrder: j } });
            }
        }
    }
    await prisma.notification.create({ data: { userId: user.id, type: 'GENERAL', title: 'Welcome to KSV Hostel', message: 'Your student portal is ready.' } }).catch(() => { });
    console.log('Seeded demo account:', user.email);
}
main().finally(() => prisma.$disconnect());
