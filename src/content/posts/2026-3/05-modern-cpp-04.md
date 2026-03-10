---
title: "Rust to modern C++ 04: Concurrency && Asynchronous Start"
pubDate: 2026-3-10
categories: ["learnings", "C++"]
description: 现代C++学习记录
---

- 前言: 本文章主要用于个人学习记录. 我学习过Rust, 接触过现代C++代码, 但未做系统性学习, 本文章尝试做一些学习梳理. 如有错误, 欢迎批评指正.
- 参考资料: _C++ Concurrency In Action_ (文中简称 _CCIA_ ).
### Basic
在Rust中, 我们通过`thread::spawn()`创建一个`JoinHandle`对象, 并使用`join()`来汇入.
```rust
fn main() {
	let handle = thread::spawn(|| {...});
	// -snip
	handle.join().unwarp();
}
```

在C++中, 类似地, 我们创建一个`std::thread`对象. 区别于Rust, 由于离开作用域后, `std::thread`的析构函数会调用`std::terminate()`, 所以我们必须在销毁前决定是`join`还是`detach`. 而在Rust中, detach是隐式的.
```
void f() {...}

int main() {
	auto my_thread = std:thread(f);
	my_thread.detach();  // or join
}
```

需要注意因为异常导致生命周期的问题, 可能需要在异常中也调用`join()`或者利用RAII. 参考*CCIA 2.1.3*.

创建`std::thread`时第一个参数是一个函数, 接下来的参数可以是要传给函数的参数. thread的构造器会拷贝提供的变量, 但内部的代码会把拷贝的参数以右值为实参调用函数, 所以如果函数接受`T&`, 考虑使用`std::ref`将参数转换成引用形式.

另外, `std::thread`和`std::unique_ptr`类似, 是可移动不可复制的.

在并发编程中有两种基本模型, 分别是共享内存式的模型和消息传递式的模式.
### Shared memory
在Rust中, 对于共享数据, 用`std::sync::Mutex<T>`来保护共享数据. Rust中数据和锁是一体的, 为了让多个线程共享所有权, 则需要使用`std::sync::Arc<T>`.
```rust
use std::sync::{Arc, Mutex};
use std::thread;

fn main() {
	let counter = Arc::new(Mutex::new(0));
	let mut handles = vec![];

	for _ in 0..10 {
		let counter = Arc::clone(&counter);
		let handle = thread::spawn(move || {
			let mut num = counter.lock().unwrap();
			*num += 1;
		})
		handles.push(handle);
	}

	for handle in handles {
		handle.join().unwrap();
	}
}
```

数据和锁一体是比较"高级"的概念. 最早人们在C语言中手动实现的锁和数据是分离的. 到了C++11, 添加了对并发模型的支持, 不过C++中的锁和数据还是分离的. 

C++通过`std::mutex`创建一个互斥量(我在后面就为了方便以锁来指称), 并通过构造`std::lock_guard<T>`来, 利用RAII来上锁和解锁:
```cpp
std::list<int> some_list;
std::mutex some_mutex;

void add_to_list(int new_value) {
	std::lock_guard<std::mutex> guard(some_mutex);
	some_list.push_back(new_value);
}

bool list_contains(int value_to_find) {
	std::lock_guard<std::mutex> guard(some_mutex); // 4
	return std::find(some_list.begin(),some_list.end(),value_to_find) !=
some_list.end();
}
```
#### race condition between APIs
尽管实现了对共享数据的互斥访问, 但事情并没有结束. 举个例子, 对于一个栈, 我们先`top()`查看栈顶元素, 然后`pop()`弹出栈顶元素, 这个过程中可能会有其他的线程做`push()`操作导致结果不一致. 为了实现一个线程安全的数据结构, 一个办法是为整个数据结构设置一个全局互斥量, 来保护操作的原子性. 
此时又可能会需要考虑锁的粒度大小的问题.
#### Deadlock && `std::scoped_lock<T>`
死锁问题就不再赘述, 在C++17中, 引入了`std::scoped_lock<T>` RAII模板类型, 和`std::lock_guard<T>`功能相同, 不过可以获取多个锁.
```cpp
std::scoped_lock<std::mutex,std::mutex> guard(lhs.m,rhs.m);
// C++17可以自动推导模板参数,可简写为:
std::scoped_lock guard(lhs.m,rhs.m);
```
#### `std::unique_lock<T>`
简单来说, `std::unique_lock`提供了更多的功能, 例如将`std::defer_lock`作为第二个参数, 则可以实现延迟上锁:
```cpp
std::unique_lock<std::mutex> lk(m, std::defer_lock);
// 做其他工作
lk.lock(); // 延迟上锁
```
除此之外还有`std::adopt_lock`, `std::try_to_lock`等.
还可以中途解锁`unlock()`再加锁`lock()`.

`std::unique_lock`可以用于不同域之间互斥量的传递, 它是一个可移动但不可复制的类型.
#### `std::shared_mutex`and`std::shared_lock<T>`
`std::shared_mutex`是一个允许共享读, 互斥写的互斥量, 适用于读操作频繁, 写操作很少的场景. 通过`std::unique_lock<T>`获得写锁, 通过`std::shared_lock<T>`获得读锁:
```cpp
#include <shared_mutex>
#include <mutex>

std::shared_mutex rw_mutex;
int shared_data = 0;

void write_data() {
    // 获取独占锁（写锁），阻塞其他所有读者和写者
    std::unique_lock<std::shared_mutex> lock(rw_mutex); 
    // 或者使用 std::lock_guard<std::shared_mutex> lock(rw_mutex);
    
    shared_data = 42; 
    // 离开作用域时自动释放写锁
}

void read_data() {
    // 获取共享锁（读锁），允许其他读者同时进入，但阻塞写者
    std::shared_lock<std::shared_mutex> lock(rw_mutex);
    
    int temp = shared_data;
    // 离开作用域时自动释放读锁
}
```

`std::shared_mutex`对应Rust中的`std::sync::RwLock<T>`, 调用`.read()`和`.lock()`分别获得读/写锁.
### 同步
同步简单来说就是, 当多个任务在跑时, 某些地方需要有先后顺序, 例如厨房中有人煮饭有人准备食材有人炒菜, 但炒菜必须等待准备食材准备好一道菜的食材, 才能开始炒.
### `std::condition_variable`
条件变量, 或者睡眠锁. 在等待时需要释放资源对应的锁, 所以需要搭配`std::unique_lock<T>`使用：
```cpp
std::mutex mut;
std::queue<data_chunk> data_queue;
std::condition_variable data_cond;

// tx
std::lock_guard<std::mutex> lk(mut);
data_queue.push(data);
data_cond.notify_one();

// rx
std::unique_lock<std::mutex> lk(mut);
data_cond.wait(
	lk, [] {return !data_queue.empty();});
auto data = data_queue.front();
data_queue.pop();
lk.unlock();
process(data);
```

在Rust中对应`std::sync::CondVar`.
### Future
Rust中的`Future` trait和Typescript中的`Promise<T>`, 在C++中则为future, 包括`std::future<>`和`std::shared_future<>`. 

`std::async()`函数会启动一个异步任务, 并返回一个`std::future`对象, 使用的方法和`std::thread()`类似.

`std::async()`允许传递一个额外参数`std::launch::async`保证新开一个线程; `std::launch::defered`表明惰性求值. 默认是`std::launch::defered | std::launch::async`, 表示可以选择两种方式的一种.
```cpp
auto f = std::async(std::launch::async, f, 42);
auto x = f.get();
```
Rust中的Future是惰性求值的.

`std::future`是只移动地, 独享结果, 通过调用`get()`一次性地获取数据. `std::shared_future`则是可拷贝的.
### `std::packaged_task<>`
`std::packaged_task<>`简单来理解就是一个任务, 通过`get_future()`方法你可以获得这个任务相应的future. 任务可以被调用或者传给其他线程, 从而开始执行任务. 任务会自动向future填值或者抛出异常, 类似于Typescript中`Promise<T>`的fulfill/reject.
```cpp
void gui_thread() {
	while(!gui_shutdown()) {
		std::packaged_task<void()> task;
		{
			std::lock_guard lk(m);
			if (!tasks.empty()) {
				task = std::move(task.front());
				tasks.pop_front();
			}
		}
		task();
	}
}

template<typename Func>
std::future<void> post_task_for_gui_thread(Func f) {
	std::packaged_task<void()> task(f);
	std::future<void> res = task.get_future();
	std::lock_guard lk(m);
	tasks.push_back(std::move(task));
	return res;
}
```
### `std::promises<T>`
`std::promises<T>`和`std::future<T>`是相关联的, future可以阻塞等待进程, 而promise则用于让提供数据的进程对相关的值进行设置, 并令future就绪. 通过`set_value()`方法设置值, 如果出现异常, 则通过`set_exception()`.
```cpp
extern std::promise<double> some_promise;
try {
	some_promise.set_value(calculate_value());
} catch(...) {
	some_promise.set_exception(std::current_exception());
}
```
## 总结
借助了大模型, 主要是对Rust, C++, Typescript三者做一下对比.
### 1) “执行单元”：Thread / Task / Future
#### C++
- **`std::thread`**：OS 线程，真正并行（多核上）。需要你管理 `join()`（不 join 也不 detach 会 `std::terminate`）。
- **`std::async` + `std::future`**：任务式并发；但默认策略是 `async|deferred`，可能不并行。
- **C++20 协程**：语言层机制有了，但标准库缺“运行时/Task/Executor”，工程上靠库（Asio、folly 等）。
#### Rust
- **`std::thread::spawn`**：OS 线程，真正并行；`JoinHandle` 不 `join()` 就被 drop，相当于“放弃结果”（类似 detach），但**进程结束线程会被强制终止**。
- **`Future`（async/await）**：Rust 的 `Future` 默认是**惰性**的（poll 才运行），必须靠 executor（Tokio/async-std）驱动；它更像“可暂停的状态机任务”，不是线程。
- Rust 中“并发”通常分两层：**线程并行**（std::thread）与 **异步并发**（Future+runtime）。
#### TypeScript（JS）
- **`Promise`**：只解决“异步结果”的组合与传播，不等于线程。
- JS 通常是单线程事件循环：并发主要来自 I/O 异步；CPU 并行要靠 Worker Threads（Node）/Web Workers（浏览器），不在你列的 Promise 范畴里。
---
### 2) “共享内存互斥”：mutex / lock / guard
#### C++
- **`std::mutex` / `std::shared_mutex`**：共享内存并发的底层工具。
- **RAII 锁封装**：
    - `lock_guard`：最简单，不能中途 unlock。
    - `unique_lock`：可延迟加锁/中途解锁/可移动；配合 `condition_variable::wait`。
    - `shared_lock`：配合 `shared_mutex` 的读锁。
    - `scoped_lock`：一次锁多个 mutex，内部用 `std::lock` 避免死锁。
#### Rust
- **`std::sync::Mutex<T>` / `RwLock<T>`**：本质对应 C++ 的 mutex/shared_mutex，但更“数据中心”：
    - 锁和数据绑定在一起；拿到 guard 才能访问 `T`。
- **Guard 对应关系**：
    - `MutexGuard` ≈ C++ `lock_guard/unique_lock`（Rust 没分两个类型，核心是 guard drop 自动解锁；需要提前解锁就 `drop(guard)`）。
    - `RwLockReadGuard` / `RwLockWriteGuard` ≈ C++ `shared_lock` / 写锁（unique/lock_guard on shared_mutex）。
- Rust 标准库**没有**像 C++ `scoped_lock(m1,m2,...)` 那样“自动避免死锁地一次锁多个”的统一接口；多把锁通常靠约定顺序/结构调整（或用 crate）。
#### TypeScript
- **没有 mutex 这类共享内存锁（在一般 JS/TS 语境下）**。因为单线程执行模型下没有同一进程内的多线程共享内存竞争（Worker 共享内存需要 `SharedArrayBuffer + Atomics`，那是另一个体系）。
---
### 3) “消息传递/异步结果”：future / promise / packaged_task

#### C++：`future/promise/packaged_task`
- **`std::future<T>`**：结果的“领取端”（像取餐票）。`get()` 是同步点（会阻塞）。
- **`std::promise<T>`**：结果的“生产端”（手动 `set_value/set_exception`）。
- **`std::packaged_task<R()>`**：把函数包装成“执行时自动把返回值/异常写入 future”的任务对象。你决定在哪执行（线程/线程池/当前线程）。
- 标准 `future` 缺少 Promise 那种原生 `then()` 链式 continuation（工程上用库补）。

#### Rust：`Future`（async） + channels（消息）
- **Rust `Future`**更像“可暂停计算”，不是“马上开始跑的后台任务”；要靠 runtime 驱动。
- Rust 的“消息传递”常用 **channel**（标准库 `mpsc`，以及 crossbeam 等更强的库）。你虽然没在问题里列 channel，但在 Rust 里它是消息传递模型的核心组件。

#### TS：`Promise`
- **Promise 是结果容器 + continuation 链（then/catch/finally）**，组合能力极强。
- 但 Promise 本身不提供线程并行；它更多是事件循环上的异步编排工具。
---
### 4) 三者最关键的“默认语义差异”（容易混淆的点）
1. **C++ `std::async` 默认不保证开线程**  
    默认是 `launch::async | launch::deferred`，实现可选 deferred；你以为并行了，可能没有。
2. **Rust `Future` 默认不执行（惰性）**  
    `async fn` 返回 future，除非 `.await` 或被 executor poll，否则不跑；这点跟很多人对 TS Promise “创建即开始” 的直觉不同。
3. **TS Promise 的强项是“组合”，不是“并行”**  
    `Promise.all` 组合的是异步 I/O 任务的完成；CPU 并行不靠它。
## 后记
消息传递模型没写, C++没有类似Rust中`mpsc`的标准库的东西, 应该要自己手写或者找别的轮子. 主要还是做了下基础的梳理, 方便后续实践做点项目, 可能有写错的地方, 如果有欢迎批评指正.