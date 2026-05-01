const tasks = [];
const maxTasks = 5;

function addTask() {
  const input = document.getElementById('taskInput');
  const desc = input.value.trim();
  if (!desc) {
    alert('Please enter a task description!');
    return;
  }
  if (tasks.length >= maxTasks) {
    alert('Maximum 5 tasks allowed!');
    return;
  }
  tasks.push({ description: desc, complete: false });
  input.value = '';
  renderTasks();
}

function renderTasks() {
  const list = document.getElementById('taskList');
  list.innerHTML = '';
  tasks.forEach((task, i) => {
    const li = document.createElement('li');
    const checked = task.complete ? 'checked' : '';
    const completeClass = task.complete ? 'complete' : '';
    li.innerHTML = '<input type="checkbox" ' + checked + ' onclick="toggleComplete(' + i + ')" />' +
      '<span class="' + completeClass + '">' + task.description + '</span>';
    list.appendChild(li);
  });
}

function toggleComplete(index) {
  tasks[index].complete = !tasks[index].complete;
  renderTasks();
}