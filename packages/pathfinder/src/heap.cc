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

} // namespace screeps
