---
title: "Binary Search: Searching for Bounds Rather Than Elements"
pubDate: 2026-5-7
categories: ["Algorithm"]
---
本文写作的缘由是我在实现B+树时，在做二分查找方面碰到了一点障碍，感觉怎么写代码都有点不顺畅，所以整理了一下。

## Binary Search in B+Tree

我们首先从单纯的二分查找开始，假设要寻找的元素为 key，有序数组大小为 n，一个可能的实现如下：

```c
int binary_search(int key, int n) {
	// 首先确定搜索区间，[start, end)
	// 采用开区间可以不用处理数组为空的边界情况
	int start = 0;
	int end = n;
	
	int l = start;
	int r = end;
	while (l < r) {
		int mid = (l + r) / 2;
		int mid_key = array[mid];
		if (mid_key >= key) {  // 当然这里如果等于也可以提前返回，这里是为了代码一致性
			r = mid;
		} else {
			l = mid + 1;
		}
	}
	// 收敛结果处于 [start, end]
	// 搜索区间 [start, end)
	// 需要对end边界情况做处理
	if (l != n && array[l] == key) {
		return l;
	}
	return -1;
}
```

其中，之所以要 l + 1，是因为有 r = l + 1 的边界情况，此时由于向下取整的特性，mid 会被计算为 l，然后如果陷入 key > mid_key 的情况，会导致无限循环。

但现在的问题是这样的，在 B+树中，每个节点中的 Key/Value pair 数组是按照 Key 排序了的，我们要根据输入的 key，找到一个**最大的**index k，满足 $arr_k <= key < arr_{k+1}$, 刚好把我们输入的 key 夹在中间。很显然上面的二分查找我们直接套用是不对的。那么正确的思路应该是怎样的呢？

如果是顺序查找，我们通常会从前往后扫描一遍，找到第一个 k 满足 $key < arr_k$ ,然后返回 k - 1 即可。因此，二分查找也采取同样的思路，我们让 l 和 r 收敛到刚好比 key 大的位置 k，然后返回 k - 1 即可：

```c
int binary_search(int key, int n) {
	int start = 0;
	int end = n;
	
	int l = start;
	int r = end;
	while (l < r) {
		int mid = (l + r) / 2;
		int mid_key = array[mid];
		if (mid_key > key) {
			r = mid;
		} else {
			//  我们在找的是比key大的，因此[0, mid]都不符合要求
			l = mid + 1;
		}
	}
	// 收敛结果处于 [start, end]
	// 搜索区间 [start, end)
	// 需要对end做处理
	return l - 1;  // 我们的实际情况顺便对end做了处理
}
```

当数组为空时，或者 start=0，且 $key < array[0]$ 时返回的就会是 -1，按照我们寻找刚好比 key 大的思路，这是一致的。结合实际情况做处理即可。
## Converge in Binary Search

假如我进一步提问，对于一个递增的有序数组，给定输入 key，要你找第一个比 key 大（或者大于等于）的，或者找最后一个比 key 小（或者小于等于）的，这些条件之间当然也可以互相转化，但核心都是一样的，都是用搜索范围作为上下界，然后根据条件不断地收紧，直到收敛到一个位置。

在我们给的第一个二分搜索的例子中，为了找到和 key 相等的元素的 index，我们其实是先收敛到了第一个大于等于 key 的位置，然后检测该位置的值是否等于我们给的 key。第二个例子中，我们为了找到最后一个小于等于 key 的位置，我们转化成了找第一个大于 key 的位置，如果按照这个收敛思路，我们没必要做转化，可以直接让 l 和 r 收敛到最后一个小于等于 key 的位置，实现如下：

```c
// 错误实现，有死循环问题
int binary_search(int key, int n) {
	int start = 0;
	int end = n;
	
	int l = start;
	int r = end;
	while (l < r) {
		int mid = (l + r) / 2;
		int mid_key = array[mid];
		if (mid_key <= key) {
			l = mid;  // 死循环
		} else {
			r = mid - 1;
		}
	}
	// 收敛结果处于 [start, end)，因为向下取整的特性，边界情况只有l改变，l最多也只能到end-1
	// 搜索区间 [start, end)，
	// 不需要异常处理
	return l;
}
```

但是这里由于 l = mid 而不是 mid + 1，因为向下取整的特性，会有死循环的问题，因此这个实现是错误的，转化成找第一个大于 key 的位置可以避免这个问题。当然了，我们也可以通过向上取整加上其他措施来修复这个问题，但这样会加重我们的记忆负担，并且没有实用价值，所以这里不做讨论。

最后可以总结一下，如果你的二分搜索问题是找“最后一个小于或者小于等于”的问题，那么代码形式就会是：

```
搜索区间[l, r)
计算mid向下取整

if (mid_key 小于/小于等于 key) {
	l = mid;
} else {
	r = mid - 1;
}

不需要对收敛结果做边界处理
但有无限循环的问题
```

因为有死循环问题，所以不建议使用。这个实现是错误的，这里写出来只是为了把情况讨论完整。

如果是找“第一个大于或者大于等于”的问题，那么代码形式就会是：

```
搜索区间[l, r)
计算mid向下取整

if (mid_key 大于/大于等于 key) {
	r = mid;
} else {
	l = mid + 1;
}

需要对收敛结果做边界处理
没有无限循环的问题
```

推荐使用这种方式，也就是说，面对找“最后一个小于或者小于等于”的问题，推荐转化为“第一个大于或者大于等于”的问题，然后实现。