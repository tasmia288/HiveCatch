import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { createPost } from '../core/post';

export const menu = new Hono();

menu.post('/post-create', async (c) => {
  try {
    console.log('Creating HiveCatch post, subreddit:', context.subredditName);
    
    const post = await createPost();
    
    console.log('Post created:', post.id);

    return c.json<UiResponse>(
      {
        navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}`,
      },
      200
    );
  } catch (error) {
    console.error(`Error creating post:`, error);
    return c.json<UiResponse>(
      {
        showToast: `Failed to create post: ${error instanceof Error ? error.message : 'Unknown error'}`,
      },
      400
    );
  }
});