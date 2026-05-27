import { reddit, context } from '@devvit/web/server';

export const createPost = async () => {
  const subredditName = context.subredditName;

  console.log('Creating post in subreddit:', subredditName);

  if (!subredditName) {
    throw new Error('No subreddit context available');
  }

  return await reddit.submitCustomPost({
    title: 'HiveCatch — Coordinated Abuse Monitor',
    subredditName,
    entry: 'default',
  });
};
