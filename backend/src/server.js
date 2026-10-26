import { PORT } from './config.js';
import { installErrorTracking } from './services/errorTracker.js';

installErrorTracking();
import app from './app.js';
import { startNotificationJobs } from './services/notificationService.js';

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  startNotificationJobs();
});
