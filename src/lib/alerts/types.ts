// src/lib/alerts/types.ts
// Notification Engine & Queue Interfaces

import type { NotificationType } from '../user_auth.ts';

export interface AlertMatchResult {
  userId: string;
  email: string;
  name: string;
  type: NotificationType;
  title: string;
  message: string;
  contentItemId: string;
}

export interface NotificationQueueItem {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  content_item_id: string | null;
  status: 'pending' | 'sent' | 'failed' | 'read';
  retry_count: number;
  error_message?: string | null;
  created_at: string;
  email?: string;
  name?: string;
}
