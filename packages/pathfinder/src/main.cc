// Author: Marcel Laverdet <https://github.com/laverdet>
// macos:
// CXX=/opt/homebrew/Cellar/llvm/22.1.0/bin/clang++ cmake -DCMAKE_BUILD_TYPE=Debug -DCMAKE_MODULE_PATH="$(pnpm exec auto_js_cmake_include)" -DCMAKE_CXX_STDLIB_MODULES_JSON=/opt/homebrew/opt/llvm/lib/c++/libc++.modules.json -G Ninja -B build && ninja -C build
// linux:
// CXX=clang++ cmake -DCMAKE_BUILD_TYPE=Debug -DCMAKE_MODULE_PATH="$(pnpm exec auto_js_cmake_include)" -G Ninja -B build && ninja -C build

// NODE_OPTIONS='--no-node-snapshot --experimental-vm-modules --enable-source-maps' lldb-22 node packages/xxscreeps/bin/xxscreeps.js test
#include "nan.h"
#include <auto_js/export_tag.h>
#include <isolated_vm.h>
import auto_js;
import screeps;
import std;
import util;
import v8_js;
using namespace screeps;
namespace iv8 = js::iv8;

constexpr auto k_max_rooms = 64;

// Invoke the user `roomCallback` and adapt for the pathfinder
class room_callback_type {
	public:
		room_callback_type() = default;
		explicit room_callback_type(iv8::context_lock_witness& lock, v8::Local<iv8::Function> maybe_room_callback) :
				lock_{&lock},
				maybe_room_callback{maybe_room_callback} {}

		auto operator()(room_location_t room) -> room_callback_result_type {
			if (maybe_room_callback.IsEmpty()) {
				return std::monostate{};
			} else {
				return maybe_room_callback->call<room_callback_result_type>(*lock_, room);
			}
		}

	private:
		iv8::context_lock_witness* lock_{};
		v8::Local<iv8::Function> maybe_room_callback;
};

// Invoked once per operation
auto check_termination() -> void {
	if (v8::Isolate::GetCurrent()->IsExecutionTerminating()) {
		throw js::iv8::pending_error{};
	}
}

// Each thread gets two pathfinders. The first can search 64 rooms and is 2.03mb, and the second can
// only search room but is 159kb. A recursive call will give you the smaller pathfinder, and then
// any after that will throw.
using pathfinder_one_type = pathfinder<check_termination, room_callback_type, k_max_rooms>;
using pathfinder_two_type = pathfinder<check_termination, room_callback_type, 1>;
using pathfinder_stack_type = resource_recursion_stack<pathfinder_one_type, pathfinder_two_type>;
thread_local pathfinder_stack_type pathfinders;

auto search(
	iv8::context_lock_witness lock,
	world_position_t origin,
	std::vector<heuristic_t::goal_t> goals,
	std::optional<js::forward<v8::Local<iv8::Function>>> room_callback,
	// NOLINTNEXTLINE(bugprone-easily-swappable-parameters)
	int plain_cost,
	int swamp_cost,
	int max_rooms,
	int max_ops,
	int max_cost,
	bool flee,
	double heuristic_weight
) -> std::optional<result> {
	return pathfinders(
		util::overloaded{
			[]() -> std::optional<result> { throw js::runtime_error{u"too many concurrent pathfinder searches"}; },
			[ & ](auto& pf) -> std::optional<result> {
				// Get the values from v8 and run the search
				return pf.search(
					room_callback_type{lock, *room_callback.value_or({})},
					origin,
					std::move(goals),
					{
						.heuristic_weight = heuristic_weight,
						.plain_cost = plain_cost,
						.swamp_cost = swamp_cost,
						.max_cost = max_cost,
						.max_ops = max_ops,
						.max_rooms = max_rooms,
						.flee = flee,
					}
				);
			},
		}
	);
}

EXPORT ISOLATED_VM_MODULE void InitForContext(v8::Isolate* isolate, v8::Local<v8::Context> context, v8::Local<v8::Object> target) {
	auto isolate_witness = js::iv8::isolate_lock_witness::make_witness(isolate);
	auto context_witness = js::iv8::context_lock_witness::make_witness(isolate_witness, context);
	js::iv8::object_assign(
		context_witness,
		target,
		std::tuple{
			std::pair{util::cw<"search">, js::free_function{search}},
			std::pair{util::cw<"loadTerrain">, js::free_function{load_terrain}},
			std::pair{util::cw<"version">, 12},
		}
	);
}

void init(v8::Local<v8::Object> target) {
	v8::Isolate* isolate = v8::Isolate::GetCurrent();
	InitForContext(isolate, isolate->GetCurrentContext(), target);
}

#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wunused-parameter"
NAN_MODULE_WORKER_ENABLED(pf, init) // NOLINT
#pragma clang diagnostic pop
