class DatabaseService {
  constructor() {
    this.useMongoDb = false;
  }
  
  async initialize() {
    console.log('Database service initialized');
  }
  
  async getParts() {
    return [];
  }
  
  async saveParts(parts) {
    return true;
  }
  
  async getTransactions() {
    return [];
  }
  
  async saveTransactions(transactions) {
    return true;
  }
  
  async getShelves() {
    return {};
  }
  
  async saveShelves(shelves) {
    return true;
  }
}

module.exports = DatabaseService;
