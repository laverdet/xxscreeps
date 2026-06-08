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

// Invoke the user `roomCallback` and adapt for the pathfinder
class room_callback_type {
	public:
		using result_type = std::variant<cost_matrix_type, util::constant_wrapper<false>, std::monostate>;

		room_callback_type() = default;
		explicit room_callback_type(v8::Local<v8::Value> maybe_room_callback) :
				callback_{maybe_room_callback->IsFunction() ? maybe_room_callback.As<v8::Function>() : v8::Local<v8::Function>{}} {}

		auto operator()(room_location_t room) -> result_type {
			if (!callback_.IsEmpty()) {
				auto room_id = std::bit_cast<std::uint16_t>(room);
				Nan::TryCatch try_catch;
				std::array<v8::Local<v8::Value>, 1> argv = {Nan::New(room_id)};
				Nan::MaybeLocal<v8::Value> ret = Nan::Call(callback_, v8::Local<v8::Object>::Cast(Nan::Undefined()), 1, argv.data());
				if (try_catch.HasCaught()) {
					try_catch.ReThrow();
					throw js::iv8::pending_error{};
				}
				if (!ret.IsEmpty()) {
					v8::Local<v8::Value> ret_local = ret.ToLocalChecked();
					if (ret_local->IsBoolean() && ret_local->IsFalse()) {
						return util::cw<false>;
					}
					Nan::TypedArrayContents<uint8_t> cost_matrix_js{ret_local};
					if (cost_matrix_js.length() == 2'500) {
						return reinterpret_cast<cost_matrix_type>(*cost_matrix_js);
					}
				}
			}
			return std::monostate{};
		}

	private:
		v8::Local<v8::Function> callback_;
};

// Invoked once per operation
auto check_termination() -> void {
	if (v8::Isolate::GetCurrent()->IsExecutionTerminating()) {
		throw js::iv8::pending_error{};
	}
}

using pathfinder_type = pathfinder<check_termination, room_callback_type, 64>;

// Init 2 Pathfinders per thread. We do 2 here because sometimes recursive calls to the path
// finder are useful. Any more than 2 deep recursion will have to allocate a new path finder at a
// cost of 2.03mb(!)
thread_local std::array<std::pair<bool, pathfinder_type>, 2> pathfinders;

auto search(
	world_position_t origin,
	std::vector<heuristic_t::goal_t> goals,
	js::forward<v8::Local<v8::Value>> room_callback,
	// NOLINTNEXTLINE(bugprone-easily-swappable-parameters)
	int plain_cost,
	int swamp_cost,
	int max_rooms,
	int max_ops,
	int max_cost,
	bool flee,
	double heuristic_weight
) -> std::optional<result> {
	// Find an inactive path finder
	auto& pf = [ & ] -> auto& {
		for (auto& ii : pathfinders) {
			if (!ii.first) {
				return ii;
			}
		}
		throw js::runtime_error{u"too many concurrent pathfinder searches"};
	}();
	pf.first = true;
	auto atdone = util::scope_exit{[ & ] -> void { pf.first = false; }};

	// Get the values from v8 and run the search
	return pf.second.search(
		room_callback_type{*room_callback},
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
}

auto load_terrain(js::forward<v8::Local<v8::Object>> world_local) -> void {
	// Parse out terrain by rooms
	world_type world;
	auto keys = Nan::GetOwnPropertyNames(*world_local).ToLocalChecked();
	for (uint32_t ii = 0; ii < keys->Length(); ++ii) {
		auto name = Nan::Get(keys, ii).ToLocalChecked();
		auto id = Nan::To<uint32_t>(name).FromJust();
		auto terrain = Nan::Get(*world_local, name).ToLocalChecked();
		world.emplace_back(
			std::bit_cast<room_location_t>(static_cast<uint16_t>(id)),
			static_cast<terrain_type>(*Nan::TypedArrayContents<uint8_t>(terrain))
		);
	}
	pathfinder_type::load_terrain(world);
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
