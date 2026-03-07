---
title: "Rust to modern C++ 03: Rvalue Refs, Move Semantics & Perfect Forwarding"
pubDate: 2026-3-7
categories: ["learnings", "C++"]
description: 现代C++学习记录
---

- 前言: 本文章主要用于个人学习记录. 我学习过Rust, 接触过现代C++代码, 但未做系统性学习, 本文章尝试做一些学习梳理. 如有错误, 欢迎批评指正.
- 参考资料: _Effective Modern C++_
## The Story of lvalue and rvalue
从概念上来说，lvalue你一般可以取到其地址，而rvalue则是临时的，一般没办法取到地址。在C语言中，lvalue和rvalue仅仅是编译器为了能够表达`5 = a`的报错引入的概念。当把一个对象赋值给另一个对象时，都是深拷贝。

C++继承自C，自然也采用了深拷贝。那么问题来了，面对以下代码:
```cpp
std::vector<int> v2 = v1;
std::string result = s1 + s2 + s3;
```

在C语言中, 面对大的数据, 一般都是直接操作指针, 例如: `struct buf *b2 = b1;`, 当然C++也可以使用C语言的风格, 但显然我们想要的并不是一个"C with class"的语言. 在这个写法中, `v2`会复制`v1`, `result`复制`s1 + s2 + s3`的临时结果, 然后拷贝完后再销毁临时结果. 因此, 我们需要一种途径来表达:
- 直接利用已有的rvalue(而不是把rvalue复制一遍然后销毁这个rvalue), 或者
- "移动"一个已有的lvalue

C++11引入了右值引用`&&`, 通过移动构造函数, 当遇到`result = rvalue`的时候, 我们可以直接转移指针, 从而实现利用已有的rvalue.

而为了表达"移动"左值, `std::move()`诞生了, `std::move()`强制把一个lvalue转化成一个rvalue, 进而直接利用, 从而实现了"移动".
## `std::move` & `std::forward`
参考 *Effective Modern C++* Item 23, 28
___
现在来看`std::move`和`std::forward`就容易理解了, 由于`std::move`直接把一个对象转成rvalue, 通常它都会去匹配移动构造器, 但事情也有例外, 例如
```cpp
class Annotation {
public:
	explicit Annotation(const std::string text)
	: value(std::move(text)) { ... }
private:
	std::string value;
}
```

事实上text并没有move进去, 而是被拷贝了. 可能性如下:
```cpp
class string {
public:
	...
	string(const string& rhs);
	string(string&& rhs);
}
```
由于一个text经过`std::move`后变成了一个`const std::string`的rvalue, 尽管有移动构造器, 但因为移动构造器不能接受cosnt, 所以实际上调用了拷贝构造器. 这也就意味着, 当我们请求move一个const对象时, 它实际上会变成拷贝操作. 我们唯一能确保的, 就是`std::move`会把一个对象变成rvalue, 也仅此而已.

知道了这一点, 就可以理解`std::forward`了. 我们已经解决了`result = rvalue`的问题, 但对于`result = f(rvalue)`, 在函数内部我们永远只知道参数是一个lvalue, 而无法得知在外面被传进来的是lvalue还是rvalue, 而这就是`std::forward`的一个典型使用场景:
```cpp
void process(const Widget& lvalArg); // process lvalues
void process(Widget&& rvalArg); // process rvalues

template<typename T> // template that passes
void logAndProcess(T&& param) // param to process
{
	auto now = // get current time
	std::chrono::system_clock::now();
	makeLogEntry("Calling 'process'", now);
	process(std::forward<T>(param));
}
```

如果你还记得以下类型推导的例子:
```cpp
auto&& x = 42;  // 42 is int and rvalue,
                // x's type is int&&.

auto x = 42;
auto&& rx = x;  // x is int and lvalue,
                // rx's type is int&.
```
类似地, 对于rvalue, T会被推导为非引用, 从而param被推导为T&&; 而对于lvalue, T会被推导为引用, 从而导致param为T&&&, 然后由于 __reference collapsing__ 被推导为 T&. 具体的细节可以参考 *Effective Modern C++* 中的内容, 从入门使用者的角度, 这里就不继续做更多介绍.
## The abstraction: universal refs and rvalue refs
参考 *Effective Modern C++* Item 24
___
从使用者的角度来说, 我们应当不去细究所谓的**reference collapsing**, 而是接受`T&&`同时作为universal ref和rvalue ref两种存在, 接受这层抽象. 基本的规则如下:
- 当`T&&`中的T是需要涉及到类型推导的, 他就是一个universal reference.
- 当不涉及到类型推导时, 就是rvalue reference.
- 当一个universal ref由一个rvalue初始化, 它就完全对应于一个rvalue ref; 当它由一个lvalue初始化, 他就完全对应于一个lvalue ref.

## 后记
由于相关的东西太多太杂, 我暂时不准备继续下去. 从实用主义的角度出发, 经过3篇学习, 应当能够初步上手现代C++的项目, 所以我决定暂时搁笔, 投入实践. 另外, 虽然写Rust是真的折腾, 但回到C++这里学了一番, 我又想念Rust了: (
