import { dbGetCustomers } from './src/services/customers.server.js';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
  try {
    console.log("Testing new services layer...");
    const customers = await dbGetCustomers();
    console.log(`Success! Found ${customers.length} customers.`);
    process.exit(0);
  } catch (e) {
    console.error("Service test failed:", e);
    process.exit(1);
  }
}

test();
