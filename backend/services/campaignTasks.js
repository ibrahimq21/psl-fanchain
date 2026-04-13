/**
 * PSL FanChain - Campaign Tasks System
 * 
 * Features:
 * - Task types (follow, share, upload, checkin)
 * - Task verification
 * - Task completion rewards
 */

const { v4: uuidv4 } = require('uuid');

// Task types
const TASK_TYPES = {
  follow: {
    id: 'follow',
    name: 'Follow',
    description: 'Follow the influencer on social media',
    points: 15,
    requiresVerification: true,
    verificationType: 'social_link'
  },
  share: {
    id: 'share',
    name: 'Share Post',
    description: 'Share the campaign post',
    points: 20,
    requiresVerification: true,
    verificationType: 'link'
  },
  upload: {
    id: 'upload',
    name: 'Upload Proof',
    description: 'Upload proof of engagement (photo/video)',
    points: 30,
    requiresVerification: false,
    verificationType: 'manual'
  },
  checkin: {
    id: 'checkin',
    name: 'Stadium Check-in',
    description: 'Check-in at the venue',
    points: 50,
    requiresVerification: true,
    verificationType: 'geo'
  },
  quiz: {
    id: 'quiz',
    name: 'Quiz',
    description: 'Answer campaign-related questions',
    points: 25,
    requiresVerification: true,
    verificationType: 'auto'
  },
  poll: {
    id: 'poll',
    name: 'Poll Vote',
    description: 'Vote in campaign poll',
    points: 10,
    requiresVerification: false,
    verificationType: 'auto'
  }
};

// Campaign tasks store
const campaignTasks = new Map();
const taskSubmissions = new Map();

/**
 * Create tasks for a campaign
 */
function createCampaignTasks(campaignId, taskConfigs) {
  const tasks = [];
  
  for (const config of taskConfigs) {
    const taskTemplate = TASK_TYPES[config.type] || TASK_TYPES.follow;
    const task = {
      id: uuidv4(),
      campaignId,
      type: config.type,
      name: config.name || taskTemplate.name,
      description: config.description || taskTemplate.description,
      points: config.points || taskTemplate.points,
      required: config.required || false,
      order: config.order || tasks.length + 1,
      verificationType: taskTemplate.verificationType,
      metadata: config.metadata || {},
      status: 'active'
    };
    tasks.push(task);
  }
  
  campaignTasks.set(campaignId, tasks);
  return tasks;
}

/**
 * Get tasks for a campaign
 */
function getCampaignTasks(campaignId) {
  return campaignTasks.get(campaignId) || [];
}

/**
 * Submit task proof
 */
function submitTaskProof(campaignId, taskId, userWallet, proof) {
  const tasks = campaignTasks.get(campaignId);
  if (!tasks) return { success: false, message: 'Campaign not found' };
  
  const task = tasks.find(t => t.id === taskId);
  if (!task) return { success: false, message: 'Task not found' };
  
  const submissionId = uuidv4();
  const submission = {
    id: submissionId,
    campaignId,
    taskId,
    userWallet,
    proof,
    status: task.verificationType === 'auto' ? 'verified' : 'pending',
    submittedAt: new Date().toISOString(),
    verifiedAt: task.verificationType === 'auto' ? new Date().toISOString() : null
  };
  
  if (!taskSubmissions.has(campaignId)) {
    taskSubmissions.set(campaignId, new Map());
  }
  taskSubmissions.get(campaignId).set(userWallet, submission);
  
  return { success: true, submission, task };
}

/**
 * Verify task submission
 */
function verifyTaskSubmission(campaignId, userWallet, approved) {
  const campaignSubmissions = taskSubmissions.get(campaignId);
  if (!campaignSubmissions) return { success: false };
  
  const submission = campaignSubmissions.get(userWallet);
  if (!submission) return { success: false };
  
  submission.status = approved ? 'verified' : 'rejected';
  submission.verifiedAt = new Date().toISOString();
  
  return { success: true, submission };
}

/**
 * Get user task status for campaign
 */
function getUserTaskStatus(campaignId, userWallet) {
  const tasks = campaignTasks.get(campaignId) || [];
  const campaignSubmissions = taskSubmissions.get(campaignId) || new Map();
  const submission = campaignSubmissions.get(userWallet);
  
  return {
    tasks: tasks.map(task => ({
      ...task,
      userStatus: submission?.taskId === task.id ? submission.status : 'not_started',
      submittedAt: submission?.taskId === task.id ? submission.submittedAt : null
    })),
    allCompleted: tasks.every(task => submission?.taskId === task.id && submission.status === 'verified')
  };
}

/**
 * Calculate total points for campaign
 */
function getCampaignTotalPoints(campaignId) {
  const tasks = campaignTasks.get(campaignId) || [];
  return tasks.reduce((sum, task) => sum + task.points, 0);
}

/**
 * Get default tasks for a campaign
 */
function getDefaultTasks() {
  return [
    { type: 'follow', name: 'Follow Influencer', required: true },
    { type: 'share', name: 'Share Campaign', required: true },
    { type: 'checkin', name: 'Check-in at Stadium', required: false },
    { type: 'quiz', name: 'Take Quiz', required: false }
  ];
}

module.exports = {
  TASK_TYPES,
  campaignTasks,
  taskSubmissions,
  createCampaignTasks,
  getCampaignTasks,
  submitTaskProof,
  verifyTaskSubmission,
  getUserTaskStatus,
  getCampaignTotalPoints,
  getDefaultTasks
};
