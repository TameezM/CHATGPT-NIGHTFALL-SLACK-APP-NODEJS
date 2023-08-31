import { App } from '@slack/bolt';
import sampleMessageCallback from './sample-message';

const register = (app: App) => {
  app.message(/(.*)/, sampleMessageCallback);
};

export default { register };
