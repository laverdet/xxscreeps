module;
#include <cassert>
export module screeps:heap;
import :utility;
import std;

namespace screeps {

constexpr auto sift_up(auto& container, std::size_t pos, auto compare, auto projection) -> void {
	auto val = std::move(container[ pos ]);
	while (pos != 0) {
		auto parent = (pos - 1) / 2;
		if (compare(projection(container[ parent ]), projection(val))) {
			container[ pos ] = std::move(container[ parent ]);
			pos = parent;
		} else {
			break;
		}
	}
	container[ pos ] = std::move(val);
}

// https://en.wikipedia.org/wiki/Heapsort#Bottom-up_heapsort
constexpr auto sift_down(auto& container, std::size_t pos, auto compare, auto projection) -> auto {
	auto hole = 0UZ;
	while (true) {
		auto left = (hole * 2) + 1;
		auto right = (hole * 2) + 2;
		if (right < pos) {
			auto larger = compare(projection(container[ left ]), projection(container[ right ])) ? right : left;
			container[ hole ] = std::move(container[ larger ]);
			hole = larger;
		} else if (left < pos) {
			container[ hole ] = std::move(container[ left ]);
			hole = left;
			break;
		} else {
			break;
		}
	}
	return hole;
}

// Produces identical results to 'std::ranges::pop_heap'
constexpr auto pop_heap(auto& container, auto compare, auto projection) -> void {
	auto size = container.size();
	auto top = std::move(container[ 0 ]);
	auto hole = sift_down(container, size, compare, projection);
	auto last = size - 1;
	container[ hole ] = std::move(container[ last ]);
	sift_up(container, hole, compare, projection);
	container[ last ] = std::move(top);
}

// Produces identical results to 'std::ranges::push_heap'
constexpr auto push_heap(auto& container, auto compare, auto projection) -> void {
	sift_up(container, container.size() - 1, compare, projection);
}

// Priority queue implementation using lazy deletion for score updates
template <class Type, class Compare, class Projection, std::size_t Capacity>
class heap_t : private Compare, private Projection {
	public:
		using value_type = Type;
		using key_compare = Compare;
		using key_project = Projection;

		explicit constexpr heap_t(key_compare&& compare = {}, key_project projection = {}) :
				key_compare{std::move(compare)},
				key_project{std::move(projection)} {}

		[[nodiscard]] constexpr auto empty() const -> bool { return heap_.empty(); }
		[[nodiscard]] constexpr auto key_comp() const -> const key_compare& { return *this; }
		[[nodiscard]] constexpr auto key_proj() const -> const key_project& { return *this; }
		[[nodiscard]] constexpr auto top() const -> value_type { return heap_[ 0 ]; }
		[[nodiscard]] constexpr auto size() const -> std::size_t { return heap_.size(); }
		constexpr auto clear() -> void { heap_.clear(); }

		constexpr auto pop() -> void {
			pop_heap(heap_, std::cref(key_comp()), std::cref(key_proj()));
			heap_.pop_back();
		}

		constexpr auto push(value_type value) -> void {
			heap_.emplace_back(value);
			push_heap(heap_, std::cref(key_comp()), std::cref(key_proj()));
		}

	private:
		inplace_vector<value_type, Capacity> heap_;
};

// Dial's heap. Score overflow and underflows (due to heuristic weight) fallback to `heap_t`.
template <class Type, class Projection, std::size_t Capacity, std::size_t Window = 256>
class bucket_heap_t : private Projection {
	public:
		using value_type = Type;
		using key_project = Projection;
		using score_type = std::invoke_result_t<Projection, Type>;

		explicit constexpr bucket_heap_t(key_project projection = {}) :
				key_project{std::move(projection)} {
			buckets_.fill(npos);
		}

		[[nodiscard]] constexpr auto empty() const -> bool { return bucket_size_ == 0 && overflow_.empty(); }
		[[nodiscard]] constexpr auto key_proj() const -> const key_project& { return *this; }
		[[nodiscard]] constexpr auto size() const -> std::size_t { return bucket_size_ + overflow_.size(); }

		constexpr auto clear() -> void {
			buckets_.fill(npos);
			pool_.clear();
			overflow_.clear();
			free_ = npos;
			bucket_size_ = 0;
			base_ = 0;
		}

		[[nodiscard]] constexpr auto top() -> value_type {
			if (bucket_size_ == 0) {
				return overflow_.top();
			}
			settle();
			if (!overflow_.empty()) {
				auto overflow_top = overflow_.top();
				if (key_proj()(overflow_top) < base_) {
					return overflow_top;
				}
			}
			return pool_[ buckets_[ bucket_of(base_) ] - 1 ].value;
		}

		constexpr auto pop() -> void {
			if (bucket_size_ == 0) {
				base_ = std::max(base_, key_proj()(overflow_.top()));
				overflow_.pop();
				return;
			}
			settle();
			if (!overflow_.empty() && key_proj()(overflow_.top()) < base_) {
				overflow_.pop();
				return;
			}
			auto& head = buckets_[ bucket_of(base_) ];
			auto index = std::exchange(head, pool_[ head - 1 ].next);
			pool_[ index - 1 ].next = std::exchange(free_, index);
			--bucket_size_;
		}

		constexpr auto push(value_type value) -> void {
			auto key = key_proj()(value);
			if (key < base_ || key - base_ >= score_type{Window}) {
				overflow_.push(value);
				return;
			}
			auto& head = buckets_[ bucket_of(key) ];
			auto index = [ & ] {
				if (free_ == npos) {
					pool_.emplace_back(value, head);
					return static_cast<index_type>(pool_.size());
				} else {
					auto index = std::exchange(free_, pool_[ free_ - 1 ].next);
					pool_[ index - 1 ] = {value, head};
					return index;
				}
			}();
			head = index;
			++bucket_size_;
		}

	private:
		using index_type = std::uint32_t;
		// 0 (which compares faster) is sentinel and positions are 1-based.
		constexpr static auto npos = index_type{0};

		struct node_t {
				value_type value;
				index_type next;
		};

		constexpr static auto bucket_of(std::integral auto key) -> std::size_t {
			return static_cast<std::size_t>(key) % Window;
		}

		// invariant: non-empty
		constexpr auto settle() -> void {
			while (buckets_[ bucket_of(base_) ] == npos) {
				++base_;
			}
		}

		std::array<index_type, Window> buckets_;
		inplace_vector<node_t, Capacity> pool_;
		heap_t<Type, std::greater<>, Projection, Capacity / 8> overflow_;
		index_type free_ = npos;
		std::size_t bucket_size_ = 0;
		score_type base_ = 0;
};

} // namespace screeps
