---
title: "Project with Modern C++ 01: Classes"
pubDate: 2026-5-7
categories: ["C++"]
description: 现代C++实践记录
---
本文主要关注“如何组织 class”，对 Modern C++中定义 class 时的各种关键字和各种成员函数做一下学习。参考资料如下：
- 项目：[Project #1 - Buffer Pool Manager | CMU 15-445/645 :: Intro to Database Systems (Fall 2025)](https://15445.courses.cs.cmu.edu/fall2025/project1/)
- 书籍：*Effective Modern C++*
### intro
在通常个人编写一些简单的小软件时，可能鲜有机会“手动地”定义 class，对于各种构造函数，析构函数都是直接使用 C++ 的默认函数。所以我们先给出项目中具体的 class 的代码作为示例：
```cpp
/**
 * @brief An RAII object that grants thread-safe read access to a page of data.
 *
 * The _only_ way that the BusTub system should interact with the buffer pool's page data is via page guards. Since
 * `ReadPageGuard` is an RAII object, the system never has to manually lock and unlock a page's latch.
 *
 * With `ReadPageGuard`s, there can be multiple threads that share read access to a page's data. However, the existence
 * of any `ReadPageGuard` on a page implies that no thread can be mutating the page's data.
 */
class ReadPageGuard {
  /** @brief Only the buffer pool manager is allowed to construct a valid `ReadPageGuard.` */
  friend class BufferPoolManager;

 public:
  /**
   * @brief The default constructor for a `ReadPageGuard`.
   *
   * Note that we do not EVER want use a guard that has only been default constructed. The only reason we even define
   * this default constructor is to enable placing an "uninitialized" guard on the stack that we can later move assign
   * via `=`.
   *
   * **Use of an uninitialized page guard is undefined behavior.**
   *
   * In other words, the only way to get a valid `ReadPageGuard` is through the buffer pool manager.
   */
  ReadPageGuard() = default;

  ReadPageGuard(const ReadPageGuard &) = delete;
  auto operator=(const ReadPageGuard &) -> ReadPageGuard & = delete;
  ReadPageGuard(ReadPageGuard &&that) noexcept;
  auto operator=(ReadPageGuard &&that) noexcept -> ReadPageGuard &;
  ~ReadPageGuard();
  // ...

 private:
  /** @brief Only the buffer pool manager is allowed to construct a valid `ReadPageGuard.` */
  explicit ReadPageGuard(page_id_t page_id, std::shared_ptr<FrameHeader> frame, std::shared_ptr<ArcReplacer> replacer,
                         std::shared_ptr<std::mutex> bpm_latch, std::shared_ptr<DiskScheduler> disk_scheduler);
  // ...
};
```
正如类名中的“page guard”，在数据库项目中，一个 buffer pool manager（后文简称 bpm） 需要面对多线程访问 buffer pool 中页面的情况，对此 bpm 提供了一个用于多线程访问场景下保护页面数据的 RAII 类型，上层想要对页面进行读和写时，必须通过 bpm 提供的接口，获得一个相应页面的 page guard 类，然后通过这个 page guard 进行数据读或者写。

上面的代码就是一个 write page guard 的部分代码，是一个典型的“手动定义”的例子。里面有很多我之前从未使用过的关键字，包括：`friend` , `delete`, `explicit`, `noexcept` ；并且涉及到各种特殊成员函数。
### 特殊成员函数，其一 —— “3/5/0 法则”
你可能已经知道“3/5/0 法则”，它涉及到以下特殊成员函数：
- 默认构造函数
- 拷贝构造函数
- 拷贝赋值运算符
- 移动构造函数
- 移动赋值运算符
- 析构函数

在一般情况下，你可能不会显示地声明它们，此时编译器会根据需要自动生成。但是一旦你需要手动定义，此时意味着你的类在管理某种资源（内存、锁等），这时候就需要遵循“3/5/0 法则”
#### 三法则
**如果一个类需要显式定义析构函数、拷贝构造函数或者拷贝赋值运算符中的任何一个，那么你几乎肯定需要同时显式定义这三个。**

这是因为，当你析构函数需要手动释放某项资源时，由于编译器自动生成的拷贝只会做浅拷贝，这回导致你复制过的对象，同一块资源被释放两次。因此，你也需要让拷贝构造函数做深拷贝，而不是浅拷贝。

由于有这种情况的存在，哪怕你实际情况可能不是这样，你也要立马根据“三法则”同时对这三个特殊成员函数做思考。
#### 五法则
随着 C++引入了移动语义，**如果你的类需要自定义析构函数、拷贝构造、拷贝赋值、移动构造、移动赋值中的任何一个，那么通常需要把这五个都自定义了。**

依旧是举个简单的例子，你把一个对象 A 移动到另一个对象 B 后，当 A 的析构函数调用时，他试图释放资源，但问题是资源已经被移动了，此时导致释放空资源的问题。因此，你需要保证移动操作让你的源对象处于“不持有资源但可以被析构”的状态。
#### 零法则
**如果一个类不需要管理任何资源，就不要写任何特殊成员函数，全部交给编译器自动生成。**

此时建议你的成员用标准库中有的 RAII 类型封装资源，例如 `std::string`, `std::vector`, `std::unique_ptr` 等，或者是自动管理资源的对象。这样编译器自动生成的特殊成员变量通常都是正确且高效的。
### 特殊成员函数，其二 —— `erase()` 与移动赋值
以下是我最初编写的移动赋值：
```cpp
/**
 * @brief The move assignment operator for `ReadPageGuard`.
 *
 * ### Implementation
 *
 * If you are unfamiliar with move semantics, please familiarize yourself with learning materials online. There are many
 * great resources (including articles, Microsoft tutorials, YouTube videos) that explain this in depth.
 *
 * Make sure you invalidate the other guard; otherwise, you might run into double free problems! For both objects, you
 * need to update _at least_ 5 fields each, and for the current object, make sure you release any resources it might be
 * holding on to.
 *
 * @param that The other page guard.
 * @return ReadPageGuard& The newly valid `ReadPageGuard`.
 */
auto ReadPageGuard::operator=(ReadPageGuard &&that) noexcept -> ReadPageGuard & {
  page_id_ = that.page_id_;
  frame_ = std::move(that.frame_);
  replacer_ = std::move(that.replacer_);
  bpm_latch_ = std::move(that.bpm_latch_);
  disk_scheduler_ = std::move(that.disk_scheduler_);
  is_valid_ = that.is_valid_;
  rlk_ = std::move(that.rlk_);

  that.is_valid_ = false;

  return *this;
}

void ReadPageGuard::Drop() {
  if (!is_valid_) {
    return;
  }
  // 省略
  is_valid_ = false;
}
```

很简单，把 that 中需要 move 的成员都给他 move 过来，然后把 that 的 is_valid_标记为 false，让 that 处于不持有资源，但可析构的状态。但是在测试中我遇到了这么一段代码（下面是 write page guard，但实现和上面示例的 read page guard 类似）：

```cpp
// Create a vector of unique pointers to page guards, which prevents the guards from getting destructed.
std::vector<WritePageGuard> pages;

// 省略

// Scenario: We should be able to create new pages until we fill up the buffer pool.
for (size_t i = 0; i < FRAMES; i++) {
  const auto pid = bpm->NewPage();
  auto page = bpm->WritePage(pid);
  pages.push_back(std::move(page));
}

// Scenario: Drop the first 5 pages to unpin them.
for (size_t i = 0; i < FRAMES / 2; i++) {
  const auto pid = pages[0].GetPageId();
  EXPECT_EQ(1, bpm->GetPinCount(pid));
  pages.erase(pages.begin());  // TODO(wnw231423): this is a test for understanding move assignment
  EXPECT_EQ(0, bpm->GetPinCount(pid));  // Test failed here!
}
```

测试失败了。这里涉及到对 `vector` 的 `erase()` 函数的理解问题，`erase()` 函数的做法是“元素左移，尾部集中销毁”。虽然在 [cppreference](https://en.cppreference.com/cpp/container/vector/erase) 只给了很隐晦的说法：

> Complexity
> Linear: the number of calls to the destructor of `T` is the same as the number of elements erased, the assignment operator of `T` is called the number of times equal to the number of elements in the vector after the erased elements.

但这里只有“元素左移，尾部集中销毁”这种做法满足条件，因为：
1. 如果先析构被 erase 的元素，那么做左移之后，尾部还需要做一次析构
2. 不能先析构被 erase 的元素，因为一旦被析构，内存释放，后面元素尝试移动赋值到该元素就会出错。
但我这里想当然地觉得 `erase()` 函数会调用被 erase 函数的析构函数，导致这里报错了。

因此，这个教训也告诉我，移动赋值也需要释放资源，所以正确的实现应该如下：
```cpp
auto ReadPageGuard::operator=(ReadPageGuard &&that) noexcept -> ReadPageGuard & {
if (this != &that) {
  Drop();
  page_id_ = that.page_id_;
  frame_ = std::move(that.frame_);
  replacer_ = std::move(that.replacer_);
  bpm_latch_ = std::move(that.bpm_latch_);
  disk_scheduler_ = std::move(that.disk_scheduler_);
  is_valid_ = that.is_valid_;
  rlk_ = std::move(that.rlk_);

  that.is_valid_ = false;
}
```
### 关键字
然后就是几个关键字的用法，这里结合自己的理解做一下记录：
1. `friend class`，结合注释可以看到这里 page guard 是一个完全私有的类，其构造函数是 private 的，并且只属于 bpm，故声明友元类。
2. `explicit`，用于构造函数不做隐式类型转换，感觉这个是好习惯应该多用，我宁愿在使用构造函数的时候显式地做类型转化，我也不想让构造函数做隐式类型转换。
3. `delete`，这个就比较显而易见了，可以看到为了防止 page guard 被复制，直接把拷贝构造和拷贝赋值 delete 了，也比较容易理解。需要注意的是，尽管把不想被使用的函数设为 private 也可以防止外界调用，但还是要用 delete，可以参考*Effective Modern C++* 的 Item 11 一章。
4. `noexcept`，用于指示一个函数绝对不会抛出异常，这个肯定也是保证正确的情况下多用，最低也能作为函数 specification 的一部分，但这个说实话让我自己来写我可能很难想到去用这个关键字。可以参考*Effective Modern C++* 的 Item 14 一章。
### 对比，Rust 中的可见性管理
依旧是以 bpm 和 page guard 为例，我们尝试一下用 Rust 实现这种关系，从我的个人感觉来说，比较现代的编程语言都淡化了“class”这种东西。所以我们借助 Rust 尝试一下。

目标是这样的，有两个 struct A（bpm）和 B（page guard），A 有公开的 fields/methods 以及私有的 fields/methods，B 也有公开的 fields/methods 以及私有的 fileds/methods，然后要求 B 的构造函数只有 A 能调用。

以下是代码示例，其中具体的 fields 和 method 都只是例子，不代表实际的实现：
```rust
// buffer_pool.rs
// 这个文件实现了 buffer_pool module

pub struct Bpm {
	pub size: u32,  // 公开的field
	frames: Vec<Frame>,  // 私有的field
}

pub struct PageGuard {
	pub size: u32,  // 公开的field
	frame: Frame,  // 私有的field
}

impl Bpm {
	pub fn new() -> Self { ... }  // 公开的method
	
	pub fn pg(&self) -> PageGuard { 
		...
		let pg = PageGuard::new();
		...
	} // 公开的method，调用了PageGuard的构造函数
	
	fn private_f(&self) { ... } // 私有的method
}

impl PageGuard {
	fn new() -> Self { ... }  // 私有的method，构造函数，只有Bpm可以调用

	pub fn get_data(&self) -> Data { ... }  // 公开的method
	
	fn private_f(&self) { ... }  // 私有的method
}
```

首先，因为 PageGuard 有私有 field，所以外界无法通过类似于 `let pg = Pageguard { size: 42, frame: xxx, }` 的方式直接构造，然后，由于 Pageguard 没有将 `new()` 设为 pub，因此外界也无法调用我们自定义的构造函数。最后，bpm 可以调用 PageGuard 的 `new()`，是因为 Bpm 和 PageGuard 在同一个模块。

这里也可以看出，相比 C++中，一个 class 以外就是外界，在 Rust 中，一个 struct 以外是 module，module 以外才是外界。这也使得 Rust 不需要 C++这种 `friend class` 的东西，就能实现同样的东西。