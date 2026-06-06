export module screeps:utility;
import std;
import util;

namespace screeps {

// Convert a contiguous 'enum class' into an iterator
template <class Enum>
struct contiguous_enum_iterator : public util::random_access_iterator_facade<int, unsigned> {
	public:
		using util::random_access_iterator_facade<int, unsigned>::operator+;
		using iterator = contiguous_enum_iterator;
		using size_type = std::underlying_type_t<Enum>;
		using value_type = Enum;
		contiguous_enum_iterator() = default;
		explicit constexpr contiguous_enum_iterator(Enum value) : value_{value} {};

		constexpr auto operator*() const -> value_type { return value_; }
		constexpr auto operator+=(difference_type offset) -> iterator& {
			value_ = static_cast<Enum>(static_cast<size_type>(value_) + offset);
			return *this;
		}
		constexpr auto operator==(const iterator& right) const -> bool { return value_ == right.value_; }
		constexpr auto operator<=>(const iterator& right) const -> std::strong_ordering { return value_ <=> right.value_; }

	private:
		constexpr auto operator+() const -> size_type { return static_cast<size_type>(value_); }
		Enum value_;
};

template <class Enum>
auto contiguous_enum_range(Enum min, Enum max) {
	return std::ranges::subrange(contiguous_enum_iterator{min}, contiguous_enum_iterator{max} + 1);
}

// Returns the sign of the value (-1, 0, or 1)
template <class Type>
constexpr auto sign(Type value) -> int {
	if (value > 0) {
		return 1;
	} else if (value < 0) {
		return -1;
	} else {
		return 0;
	}
}

// Returns the given unsigned type for an arbitrary size
template <std::size_t> struct uint_for_size;
template <std::size_t Size>
using uint_for_size_t = uint_for_size<Size>::type;
template <> struct uint_for_size<1> : std::type_identity<std::uint8_t> {};
template <> struct uint_for_size<2> : std::type_identity<std::uint16_t> {};
template <> struct uint_for_size<4> : std::type_identity<std::uint32_t> {};
template <> struct uint_for_size<8> : std::type_identity<std::uint64_t> {};

// Holder for nominal types which cannot be implicitly converted between otherwise compatible
// values.
template <class Type, class>
class nominal {
	public:
		using value_type = Type;

		constexpr nominal() = default;
		explicit constexpr nominal(Type value) : value{value} {}

		explicit constexpr operator Type() const { return **this; }
		constexpr auto operator*() const -> Type { return value; }
		constexpr auto operator==(const nominal& right) const -> bool = default;

	private:
		Type value;
};

// Minimal polyfill for std::inplace_vector
template <class Type, std::size_t Size>
class inplace_vector : private std::allocator<Type> {
	public:
		[[nodiscard]] constexpr auto empty() const -> bool { return size_ == 0; }
		[[nodiscard]] constexpr auto size() const -> std::size_t { return size_; }
		constexpr auto back(this auto& self) -> auto& { return self.data_[ self.size_ - 1 ]; }
		constexpr auto begin(this auto& self) { return self.data_.begin(); }
		constexpr auto end(this auto& self) { return self.data_.begin() + self.size_; }
		constexpr auto data(this auto& self) { return self.data_.data(); }
		constexpr auto operator[](this auto& self, std::size_t index) -> auto& { return self.data_[ index ]; }
		constexpr auto front(this auto& self) -> auto& { return self.data_.front(); }

		constexpr auto clear() -> void {
			while (size_ > 0) {
				pop_back();
			}
		}

		constexpr auto pop_back() -> void {
			allocator_traits::destroy(*this, &back());
			--size_;
			if consteval {
				allocator_traits::construct(*this, &data_[ size_ ]);
			} else {
				if constexpr (!std::is_trivially_destructible_v<Type>) {
					allocator_traits::construct(*this, &data_[ size_ ]);
				}
			}
		}

		constexpr auto emplace_back(auto&&... args) -> void {
			if (size_ >= Size) {
				throw std::range_error{"capacity exceeded"};
			}
			allocator_traits::destroy(*this, &data_[ size_ ]);
			++size_;
			allocator_traits::construct(*this, &data_[ size_ - 1 ], std::forward<decltype(args)>(args)...);
		}

	private:
		using allocator_traits = std::allocator_traits<std::allocator<Type>>;
		std::array<Type, Size> data_;
		std::size_t size_ = 0;
};

}; // namespace screeps

namespace std {

// Footgun: `std::numeric_limits<T>::max()` is defined for non-numeric types!
template <class Type, class Tag>
struct numeric_limits<screeps::nominal<Type, Tag>> : numeric_limits<Type> {};

} // namespace std
