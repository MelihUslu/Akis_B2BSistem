import { PORT } from './config.js';
import app from './app.js';
import { startNotificationJobs } from './services/notificationService.js';

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  startNotificationJobs();
});
