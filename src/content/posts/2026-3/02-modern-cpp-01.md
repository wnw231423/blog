---
title: "Rust to modern C++ 01: `auto`, `const` & Uniform Initialization"
pubDate: 2026-3-6
categories: ["learnings", "C++"]
description: 现代C++学习记录
---

- 前言: 本文章主要用于个人学习记录. 我学习过Rust, 接触过现代C++代码, 但未做系统性学习, 本文章尝试做一些学习梳理. 如有错误, 欢迎批评指正.
- 参考资料: _Effective Modern C++_.

```rust
let mut x = 42;
const CONSTANT: i32 = 42;
let hello = String::from("Hello, world!");
let vec: Vec<_> = vec![1, 2, 3];
```

对于以上最基础的Rust代码，我们可以找出很多东西。Rust有类型推断，这意味着我们在很多情况下可以省略类型标注；在Rust中，变量通常是immutable的，需要我们显示地去标注`mut`；Rust有许多方法来初始化一个变量，既可以借助一个`struct`中的method去构造，也可以使用宏直接构造一个已经包含某些元素的vector。

本文从类型推断，可变性以及初始化三部分入手Modern C++。

## `auto`与类型推断

参考 _Effective Modern C++_, Item 2, 5, 6.

---

考虑以下情况：

1. 非指针或引用:

```cpp
auto x = 42;  // x's type is int.
const auto cx = x;  // cx's type is const int.
```

需要注意的是以下情况:

```cpp
int x = 42;
const int cx = x;
const int& rx = x;

auto a = x;  // a's type is int.
auto a = cx;  // a's type is int.
auto a = rx;  // a's type is int.
```

2. 指针或者引用:

```cpp
auto x = 42;
auto& rx = x; // rx's type is int&.
const auto& crx = x;  // crx's type is const int&.
auto* xp = &x;  // xp's type is int*.
```

3. Universal reference:

```cpp
auto&& x = 42;  // 42 is int and rvalue,
                // x's type is int&&.

auto x = 42;
auto&& rx = x;  // x is int and lvalue,
                // rx's type is int&.
```

关于lvalue和rvalue的内容, 在后面继续.

然后考虑以下特殊情况:

1. 数组与函数, 当类型标注不是引用时, 会退化为指针(decay into pointers). 这里直接引用 _Effective Modern C++_ 中的例子:

```cpp
const char name[] = "R. N. Briggs";  // name's type is const char[13].
auto arr1 = name;  // arr1's type is const char*, decays into a pointer.
auto& arr2 = name;  // arr2's type is const char (&)[13].

void someFunc(int, double);  // someFunc is a function;
                             // type is void(int, double).
auto func1 = someFunc;  // func1's type is void (*)(int, double).
auto& func2 = someFunc;  // func2's type is void (&)(int, double).
```

2. 使用braced initialization初始化:

```cpp
auto x = { 42 };  // type is std::initializer_list<int>, value is { 27 }.
```

3. 替身类(proxy classes)的使用:

```cpp
auto bv = std::vector<bool>{true, false, true};
auto b = bv[2];  // b's type is std::vector<bool>::reference
```

由于隐藏的替身类导致`auto`没能推断出你想要的类型时, 最好的解决方法是使用 _the explicitly typed initializer idiom_ :

```cpp
auto b = static_cast<bool>(bv[2]);
```

宁愿写`auto`和`static_cast`也不直接把类型显式地写在最前面, 是因为`auto`有很多好处, 值得我们去使用, 以及为了代码风格地统一:

- `auto`变量必须被初始化, 从而可以避免潜在的问题.
- 使用`auto`可以让代码变得更简洁, 不冗长啰嗦(verbose).
- 使用`auto`可以防止你写的类型与实际类型不匹配, 从而防止造成一些可移植性和性能问题.

```cpp
unsigned sz = v.size();  // unsigned is 32-bit on 64-bit windows
auto sz = v.size();  // sz's type is std::vector<int>::size_type,
                     // which is 64-bit on 64-bit windows.

for (const auto& p: map) { ... }  // the actual type is
                                  // std::pair<const std::string, int>,
for (const std::pair<std::string, int>& p: map) { ... }  // temp objects are created.
```

## `const` things

参考 _Effective Modern C++_ Item 13, 15.

---

1. `const`, 用于声明一个变量不可修改。至于指针常量，常量指针等文字游戏知识，这里不做说明。
2. `const_iterator`, 传达只读意图. 在C++11中, 容器类型内置了`cbegin()`和`cend()`, 在C++14中增加了非成员函数`std::cbegin()`和`std::cend()`. 建议使用非成员函数, 让代码更通用. C++11可以通过先将数组/容器绑定到`const`引用, 然后再调用`std::begin()/end()`达到相同效果.
3. `constexpr`:
   1. constexpr object: 编译期就能知道值.
   2. constexpr function: 当参数都是constexpr时, 可以在编译期求值; 当参数有一个不是constexpr, 则表现为正常的函数.

## Uniform Initialization

参考 _Effective Modern C++_ Item 7.

---

有Parenthesized Initialization和Braced Initialization。这里涉及到个人选择的问题, 选择一种方式, 必要时使用另一种方式即可.

```cpp
auto vec1 = std::vector<int>(5, 1);  // Parenthesized Initialization
                                     // {1, 1, 1, 1, 1}
auto vec2 = std::vector<int> {1, 2, 3};  // Braced Initialization
                                         // {1, 2, 3}
```

我选择使用Braced Initialization, 需要注意以下几点:

- 当使用Braced Initialization时, 编译器会尽可能地去优先匹配(甚至是会优做隐式转换)使用`std::initializer_list`的构造函数, 哪怕其他构造函数的参数类型看起来匹配地更好. 但是当传入的initializer_list为空时, 又会使用默认构造函数, 此时需要显式地说明

```cpp
Widget w1{};  // calls default constructor
Widget w2({});  // calls std::initializer_list with empty list
```

- 有时候可能会有使用Parenthesized Initialization的必要, 例如上面vector的例子.
