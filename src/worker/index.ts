import { supabase } from '../shared/supabase';
import { runDeployment } from './executor';

async function startWorker() {
  console.log('Worker started, polling for tasks...');

  while (true) {
    const { data: task, error } = await supabase
      .from('deployments')
      .select('id')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error polling for tasks:', error);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      continue;
    }

    if (task) {
      console.log(`Picked up task: ${task.id}`);
      await runDeployment(task.id);
    } else {
      // Sleep for a bit if no tasks
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

startWorker().catch(console.error);
