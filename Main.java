import java.util.Scanner;

class Task{
    private String description;
    private boolean isComplete;

    public Task(String description){
        this.description = description;
        this.isComplete = false;
    }

    public String getDescription(){
        return description;
    }
    public boolean getComplete(){
        return isComplete;
    }

    public void setComplete(boolean Complete){
        isComplete = Complete;
    }

    public void display(){
        if (isComplete){
            System.out.println("[X] " + description);
        }else {
            System.out.println("[ ] " + description);
        }
    }

}

class TodoList{
    Task[] tasks = new Task[5];
    int count = 0;
    Scanner sc = new Scanner(System.in);

    public void addTask(){
        if (count < tasks.length){
            System.out.print("enter description ");
            String description = sc.nextLine();

            tasks[count] = new Task(description);
            count++;
            System.out.println("Task added! ");
        }
    }

    public void showTasks(){
        if(count == 0 ){
            System.out.println("No task yet");
            return;
        }
        System.out.println("=====YOUR TASKS=====");
        for (int i = 0;i < count ; i++){
            System.out.print((i + 1 + ". "));
            tasks[i].display();
        }
    }
    public void completeTask(){
        if (count == 0) {
            System.out.println("No tasks to complete!\n");
            return;
        }

        showTasks();

        System.out.println("Which task number to mark complete");
        String Tasknum = sc.nextLine();
        int tasknum = Integer.parseInt(Tasknum);

        if (tasknum >= 1 && tasknum <= count) {
        int index = tasknum - 1;
        tasks[index].setComplete(true);
        System.out.println("Task marked as complete ");}
        else {
            System.out.println("invalid number");
        }
    }


    public void run(){
        while (true){
            System.out.println("===== TO-DO LIST =====");
            System.out.println("1. Add Task");
            System.out.println("2. View Tasks");
            System.out.println("3. Mark Task Complete");
            System.out.println("4. Exit");
            System.out.print("Choice: ");

            String choicein = sc.nextLine();
            int choice = Integer.parseInt(choicein);

            switch (choice){
                case 1:
                    addTask();
                break;
                case 2:
                    showTasks();
                break;
                case 3:
                    completeTask();
                break;
                case 4:
                    System.out.println("good bye");
                    closeScanner();
                    return;
                default:
                    System.out.println("Invalid choice! Try again.\n");

            }
        }
    }

    public void closeScanner(){
        sc.close();
    }

}

public class Main{
    public static void main(String[] args){

        TodoList list = new TodoList();

        list.run();



    }
}