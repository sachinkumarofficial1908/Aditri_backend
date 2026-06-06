'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const Employee = require('../src/models/Employee');
const User = require('../src/models/User');

const EMPLOYEES_PER_SUPERVISOR = 12;

const firstNames = [
  'Amit',
  'Ravi',
  'Sunil',
  'Vijay',
  'Rakesh',
  'Manoj',
  'Deepak',
  'Sanjay',
  'Pawan',
  'Ajay',
  'Mahesh',
  'Dinesh',
];

const lastNames = [
  'Kumar',
  'Singh',
  'Yadav',
  'Mishra',
  'Verma',
  'Gupta',
  'Tiwari',
  'Sharma',
  'Patel',
  'Pandey',
  'Chaudhary',
  'Maurya',
];

const fatherNames = [
  'Ram Prasad',
  'Shyam Lal',
  'Hari Shankar',
  'Mohan Lal',
  'Brijesh Kumar',
  'Suresh Prasad',
  'Rajendra Singh',
  'Om Prakash',
  'Kailash Nath',
  'Bhola Prasad',
  'Nand Lal',
  'Gopal Singh',
];

const designations = [
  'Helper',
  'Electrician',
  'Fitter',
  'Welder',
  'Rigger',
  'Technician',
  'Mason',
  'Painter',
  'Store Helper',
  'Scaffolder',
  'Operator',
  'Cleaner',
];

const grades = ['Skilled', 'Semi-skilled', 'Unskilled'];

const padNumber = (value, length) => String(value).padStart(length, '0').slice(-length);

const makeEmployeeData = ({ supervisor, supervisorIndex, employeeIndex, createdBy }) => {
  const serial = (supervisorIndex + 1) * 100 + employeeIndex + 1;
  const suffix = `${padNumber(supervisorIndex + 1, 2)}${padNumber(employeeIndex + 1, 2)}`;
  const name = `${firstNames[employeeIndex % firstNames.length]} ${lastNames[(supervisorIndex + employeeIndex) % lastNames.length]}`;
  const joinDate = new Date(Date.UTC(2025, employeeIndex % 12, 5 + (employeeIndex % 20), 12));
  const dob = new Date(Date.UTC(1984 + (employeeIndex % 18), employeeIndex % 12, 8 + (employeeIndex % 18), 12));
  const gradeOfWork = grades[(supervisorIndex + employeeIndex) % grades.length];

  return {
    employeeId: `DUMMYEMP${suffix}`,
    name,
    fatherName: fatherNames[(supervisorIndex + employeeIndex) % fatherNames.length],
    addressLine1: `Dummy Colony Lane ${employeeIndex + 1}`,
    addressLine2: supervisor.siteName || 'Project Site',
    pincode: padNumber(211000 + serial, 6),
    siteName: supervisor.siteName || `Demo Site ${supervisorIndex + 1}`,
    dob,
    dateOfJoining: joinDate,
    aadharNo: `91${padNumber(serial, 10)}`,
    panNo: `DMY${padNumber(serial, 7)}`,
    uanNo: `81${padNumber(serial, 8)}`,
    esicNo: `71${padNumber(serial, 15)}`,
    bankAccountNumber: `33${padNumber(serial, 14)}`,
    ifscCode: 'IDIB000P001',
    bankAddress: 'IDBI Bank, Demo Branch',
    phone: `98${padNumber(serial, 8)}`,
    designation: designations[employeeIndex % designations.length],
    gradeOfWork,
    dailyWagesRate: gradeOfWork === 'Skilled' ? 750 : gradeOfWork === 'Semi-skilled' ? 650 : 550,
    govDailyWage: gradeOfWork === 'Skilled' ? 700 : gradeOfWork === 'Semi-skilled' ? 600 : 500,
    clmsId: `CLMSDMY${suffix}`,
    status: 'Valid',
    supervisor_id: supervisor._id,
    createdBy,
  };
};

const seed = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is missing in backend/.env');
  }

  await mongoose.connect(process.env.MONGO_URI);

  const supervisors = await User.find({ role: 'supervisor', isActive: true })
    .select('name email siteName')
    .sort({ name: 1 });

  if (!supervisors.length) {
    console.log('No active supervisors found. Create supervisors first, then run this script again.');
    return;
  }

  const admin = await User.findOne({ role: 'admin' }).select('_id');
  let created = 0;
  let skipped = 0;

  for (const [supervisorIndex, supervisor] of supervisors.entries()) {
    for (let employeeIndex = 0; employeeIndex < EMPLOYEES_PER_SUPERVISOR; employeeIndex += 1) {
      const data = makeEmployeeData({
        supervisor,
        supervisorIndex,
        employeeIndex,
        createdBy: admin?._id || supervisor._id,
      });

      const exists = await Employee.exists({
        $or: [
          { employeeId: data.employeeId },
          { clmsId: data.clmsId },
          { aadharNo: data.aadharNo },
          { phone: data.phone },
          { uanNo: data.uanNo },
          { esicNo: data.esicNo },
          { bankAccountNumber: data.bankAccountNumber },
        ],
      });

      if (exists) {
        skipped += 1;
        continue;
      }

      await Employee.create(data);
      created += 1;
    }
  }

  console.log(`Supervisors found: ${supervisors.length}`);
  console.log(`Dummy employees created: ${created}`);
  console.log(`Already existing/skipped: ${skipped}`);
  console.log(`Target per supervisor: ${EMPLOYEES_PER_SUPERVISOR}`);
};

seed()
  .catch((error) => {
    console.error('Dummy employee seeding failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
