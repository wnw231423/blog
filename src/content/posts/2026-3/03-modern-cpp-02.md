---
title: "Rust to modern C++ 02: Enums and Smart Pointers"
pubDate: 2026-3-6
categories: ["learnings", "C++"]
description: 现代C++学习记录
---

- 前言: 本文章主要用于个人学习记录. 我学习过Rust, 接触过现代C++代码, 但未做系统性学习, 本文章尝试做一些学习梳理. 如有错误, 欢迎批评指正.
- 参考资料: _Effective Modern C++_

# Enums and Smart Pointers
## Enums
 参考 *Effective Modern C++* Item 10.
___
Rust的Enum和OCaml中的Variant非常相似，功能强大且支持模式匹配。
```rust
enum Message {
	Quit,
	Move {x: i32, y: i32},
	Write(String),
	ChangeColor(i32, i32, i32)
}
```

而C++中的Enum则没有这么强大的功能。首先，C++98 风格的Enum被称为**unscoped enums**， 因为enum中定义的变量会“溢出”到作用域中来，例如:
```cpp
enum Color { black, white, red };
auto white = 42;  // error! white is declared in this scope.
```

而C++11的**scoped enums**则避免了这个问题：
```cpp
enum class Color { black, white, red };
auto white = 42;
auto c = Color::white;
```

scoped enums中的这个"class"提供了很多信息, 它让类型变得更严格, unscoped enums可以直接当作int来使用, 而scoped enum则无法直接被当作int来使用, 尽管在底层实现上还是int, 需要通过`static_cast`转化. 另外, 两者的底层实现类型也可以更改, 但只能是一种类型, 做不到像Variant那样每种选项有不同的类型.

这个特点意味着, 有时候可能unscoped enums也会有用武之地, 例如:
```cpp
using UserInfo = 
	std::tuple<std::string,   // name
			   std::string,   // email
			   std::size_t>;  // reputation

UserInfo uinfo;
auto val = std::get<1>(uinfo);
```
此时使用unscoped enums定义一下会让代码逻辑变得更清晰:
```cpp
enum UserInfoFields { uiName, uiEmail, uiReputation };
auto val = std::get<uiEmail>(uinfo);
```

相比之下还是Variant要好用得多.
## Smart Pointers
参考 *Effective Modern C++* Chapter 4, Item 18 ~ 21
___
Rust中的智能指针非常多, 说来惭愧, 在我仅有的Rust实践经验中, 我只用过`Box<T>`这一个智能指针, 用于写了一个哈夫曼树, 但我还是会尽量尝试结合我已知的东西, 如果有错误, 十分欢迎批评指正.
### `std::unique_ptr`
从Rust的角度来说, unique_ptr应该是最好理解的指针了, 因此也十分常用. unique_ptr实现了在C++中的唯一拥有权, 只能被移动, 而不能被复制. 除此之外, unique_ptr在通常情况下开销也非常小. 一个常见的使用场景就是一个factory function返回一个unique_ptr. 
```cpp
class Investment { ... };

class Stock:
	public Investment { ... };

class Bond:
	public Investment { ... };

class RealEstate:
	public Investment { ... };

std::unique_ptr<Investment> make_investment(...) { ... };
```

unique_ptr的删除器可以自定义. 如果是factory function的使用场景下, 我们一般会调用基类的析构函数, 这意味着基类需要有一个vitrual destructor.
```cpp
class Investment {
public:
	...
	virtual ~Investment();
}

auto del_investment = [](Investment* p) {
	make_log_entry(p);
	delete p;
};

std::unique_ptr<Investment, decltype(del_investment)>
make_investment(...) { ... }

// C++14 can make use of function return type deduction
// to write simpler and more encapsulated codes:
auto make_investment(...) {
	auto del_investment = [](Investment* p) {
		make_log_entry(p);
		delete p;
	};
	...
}
```
需要注意的是:
- 自定义删除器会影响unique_ptr的类型.
- 自定义删除器可能会增大unique_ptr的开销, 优先选择no capture lambda function, 然后再考虑captured lambda function以及一般的函数对象.

最后, unique_ptr转化为`std::shared_ptr`十分方便快速, 但反过来则不然. 因此, factory function返回一个unique_ptr, 可以把选择权留给用户.
### `std::shared_ptr`
就我目前的理解来说, shared_ptr和Rust中的`Rc<T>`十分类似, 所以在语义上不做过多说明.

与unique_ptr对比, shared_ptr的开销当然会变大, 但一般来说这是值得的. 除此之外, 自定义的删除器不会影响shared_ptr的类型:
```cpp
auto sw = std::shared_ptr<Widget>(new Widget, cus_del);
```
可以看到自定义删除器不在类型标注里.

不过最关键的还是在于裸指针的使用, 应当尽量通过**make functions**来创建shared_ptr, 这样会更安全, 但也有不得不使用裸指针的情况, 此时需要结合shared_ptr的实现, 注意以下问题: 
- `std::make_shared`总是会创建一个控制块（control block）
- 由unique_ptr创建的shared_ptr也会创建一个控制块
- 当使用裸指针创建一个shared_ptr时, 会创建一个控制块

所以如果想要通过一个已经有控制块的对象创建一个shared_ptr, 最好是用已有的shared_ptr或者weak_ptr. 如果拿一个已经存在的裸指针来创建, 可能会有以下问题:

```cpp
auto pw = new Widget;
std::shared_ptr<Widget> spw1(pw, logging_del);
std::shared_ptr<Widget> spw2(pw, logging_del);
```

此处, 由于需要自定义删除器, 用`std::make_shared`不合适, 不得不使用裸指针. 由于一个裸指针被拿来创建了两个shared_ptr, 产生了两个控制块, 释放时就会导致释放两次.
此时最好的方式是**直接**使用`new`的结果而不是用一个裸指针变量:

```cpp
std::shared_ptr<Widget> spw1(new Widget, logging_del);
std::shared_ptr<Widget> spw2(spw1);
```

另外, 还有一种情况就是在`class`中涉及到使用`this`的情况, 此时也是一个裸指针, 如果一个操作(operation)把`this`加入到一个`shared_ptr`数组中, 那也可能产生一些undefined behavior. shared_ptr的API给出了解决方案, 让这个类继承`std::enable_shared_from_this<T>`. 具体细节可以参考*Effective Modern C++* Item 19.
### `std::weak_ptr`
看到这个指针, 几乎会立刻想起Rust中的`Weak<T>`, 以及与之相关的循环引用以及空悬指针(dangling pointers)问题. 在Rust中, `Weak<T>`通过`Rc::downgrade`来获得, 并通过`upgrade`方法获得一个`Option<Rc<T>>`来确认值是否存在.

类似地, 在C++中, weak_ptr也需要通过shared_ptr来构造, 并且在使用时, 通过`lock()`方法来获得一个shared_ptr(或者null).
```cpp
auto spw = std::make_shared<Widget>();
std::weak_ptr<Widget> wpw(spw);
std::shared_ptr<Widget> spw1 = wpw.lock();
```

在使用方面, 我认为Rust Book讲得很好: 在tree的例子中, 父节点应当**拥有**子节点, 而子节点不应该拥有父节点, 因此子节点应当使用weak_ptr指向父节点而不是shared_ptr. 理清数据的**所有权**, 什么时候使用weak_ptr应当是不言而喻的.
### `make` functions
无论是从软件工程, 异常安全还是程序效率的角度, 使用`std::make_unique<T>()`和`std::make_shared<T>()`都是更好的选择. 在多数情境下, 我并不关心异常安全和程序效率, 所以细节就不在此展开, 可以参考 *Effective Modern C++* 和其他资料.

对于unique_ptr, 自定义删除器(custom deleters)和braced initializers, 这两个场景可能会涉及到使用裸指针, 自定义删除器的场景已经说过, 而braced initializer的问题则有一个workaround:
```cpp
auto init_list = { 10, 20 };
auto spv = std::make_unique<std::vector<int>>(init_list);
```

对于shared_ptr, 除了上面两者, 还有其他需要注意的场景. 首先, 如果一个class有自己的内存管理, 定义了自己的`new`和`delete`, 那么用shared_ptr就不太合适, 不一定完全正确.

其次, 如果一个类占据内存很大, 在使用make_shared时会创建一整块内存, 即使ref count计为0, 还要延迟等待weak count归0才能释放整块内存; 而使用new创建shared_ptr, 由于过程中实际上对象和控制块是分开创建的, ref count归0时就可以释放掉对象, weak count归0时再释放掉控制块, 此时使用new创建可能反而更好.

最后, 考虑以下例子:
```cpp
void process_widget(std::shared_ptr<Widget> spw, int priority);

void cus_del(Widget *ptr);

process_widget(
	std::shared_ptr<Widget>(new Widget, cus_del)
	compute_priority()
);
```
这里创建shared_ptr和计算权重两个参数, 由于参数的求值顺序是未定的, 编译器做出任何顺序都是合理的, 可能会 new -> compute -> shared_ptr, 此时compute异常, new出来的裸指针还没来得及被shared_ptr接管, 程序就异常退出, 导致这个裸指针内存泄漏. 所以最好的办法是写代码就要把顺序制定好:
```cpp
auto spw = std::shared_ptr<Widget>(new Widget, cus_del);
process_widget(std::move(spw), compute_priority());
```

## 后记
无论是Rust还是C++，智能指针都是块硬骨头，我写出来的东西很可能会有错误，虽然前言已经提过，还是想再说一下，如有错误请大佬不喜勿喷，感谢批评指正：）
