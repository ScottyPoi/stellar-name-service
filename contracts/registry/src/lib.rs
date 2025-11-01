#![no_std]

#[cfg(test)]
extern crate std;

use soroban_sdk::{contract, contractevent, contractimpl, contracttype, Address, BytesN, Env};

/// Storage key namespaces (placeholders for future data layout).
mod keys {
    pub const OWNER: &[u8] = b"REG_OWNER";     // namehash -> Address
    pub const RESOLVER: &[u8] = b"REG_RESOLV";  // namehash -> Address
    pub const EXPIRES: &[u8] = b"REG_EXPIRE";   // namehash -> u64
    pub const FLAGS: &[u8] = b"REG_FLAGS";      // namehash -> u32 (bitflags)
}

/// Event payload types (expand as needed).
#[derive(Clone)]
#[contractevent(topics = ["transfer"])]
pub struct EvtTransfer {
    #[topic]
    pub namehash: BytesN<32>,
    pub from: Address,
    pub to: Address,
}

#[derive(Clone)]
#[contractevent(topics = ["resolver_changed"])]
pub struct EvtResolverChanged {
    #[topic]
    pub namehash: BytesN<32>,
    pub resolver: Address,
}

#[derive(Clone)]
#[contractevent(topics = ["renew"])]
pub struct EvtRenew {
    #[topic]
    pub namehash: BytesN<32>,
    pub expires_at: u64,
}

#[contract]
pub struct Registry;

#[derive(Clone)]
#[contracttype]
enum DataKey {
    Owner(BytesN<32>),
}

/// Minimal, compilable interface. Add real logic later.
#[contractimpl]
impl Registry {
    /// Trivial function so the contract exports at least one method.
    pub fn version(_env: Env) -> u32 {
        1
    }

    fn read_owner(env: &Env, namehash: &BytesN<32>) -> Option<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::Owner(namehash.clone()))
    }

    // --- Stubs to be implemented later ---
    pub fn set_owner(env: Env, namehash: BytesN<32>, new_owner: Address) {
        let key = DataKey::Owner(namehash.clone());
        let storage = env.storage().persistent();
        let current_owner: Option<Address> = storage.get(&key);

        match current_owner.as_ref() {
            Some(owner) => owner.require_auth(),
            None => new_owner.require_auth(),
        }

        env.storage().persistent().set(&key, &new_owner);

        let from = current_owner.unwrap_or_else(|| new_owner.clone());
        EvtTransfer {
            namehash,
            from,
            to: new_owner,
        }
        .publish(&env);
    }

    pub fn owner(env: Env, namehash: BytesN<32>) -> Address {
        Self::read_owner(&env, &namehash).unwrap_or_else(|| panic!("owner not set"))
    }

    pub fn transfer(env: Env, namehash: BytesN<32>, to: Address) {
        let current_owner =
            Self::read_owner(&env, &namehash).unwrap_or_else(|| panic!("owner not set"));
        current_owner.require_auth();
        Self::set_owner(env, namehash, to);
    }
    // pub fn set_resolver(env: Env, namehash: BytesN<32>, resolver: Address) { ... }
    // pub fn transfer(env: Env, namehash: BytesN<32>, to: Address) { ... }
    // pub fn renew(env: Env, namehash: BytesN<32>) { ... }
    // pub fn owner(env: Env, namehash: BytesN<32>) -> Address { ... }
    // pub fn resolver(env: Env, namehash: BytesN<32>) -> Address { ... }
    // pub fn expires(env: Env, namehash: BytesN<32>) -> u64 { ... }
    // pub fn namehash(env: Env, labels: Vec<Bytes>) -> BytesN<32> { ... }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, MockAuth, MockAuthInvoke},
        IntoVal, Env,
    };
    use std::panic::{catch_unwind, AssertUnwindSafe};

    #[test]
    fn it_compiles_and_returns_version() {
        let e = Env::default();
        let id = e.register(Registry, ());
        let client = RegistryClient::new(&e, &id);
        assert_eq!(client.version(), 1);
    }

    #[test]
    fn set_owner_persists_owner() {
        let e = Env::default();
        let id = e.register(Registry, ());
        let client = RegistryClient::new(&e, &id);

        let namehash = BytesN::from_array(&e, &[1u8; 32]);
        let owner = Address::generate(&e);

        client
            .mock_auths(&[MockAuth {
                address: &owner,
                invoke: &MockAuthInvoke {
                    contract: &id,
                    fn_name: "set_owner",
                    args: (&namehash, &owner).into_val(&e),
                    sub_invokes: &[],
                },
            }])
            .set_owner(&namehash, &owner);

        assert_eq!(client.owner(&namehash), owner);
    }

    #[test]
    fn set_owner_requires_current_owner() {
        let e = Env::default();
        let id = e.register(Registry, ());
        let client = RegistryClient::new(&e, &id);

        let namehash = BytesN::from_array(&e, &[2u8; 32]);
        let owner = Address::generate(&e);
        let attacker = Address::generate(&e);

        client
            .mock_auths(&[MockAuth {
                address: &owner,
                invoke: &MockAuthInvoke {
                    contract: &id,
                    fn_name: "set_owner",
                    args: (&namehash, &owner).into_val(&e),
                    sub_invokes: &[],
                },
            }])
            .set_owner(&namehash, &owner);

        let attempted_takeover = catch_unwind(AssertUnwindSafe(|| {
            client
                .mock_auths(&[MockAuth {
                    address: &attacker,
                    invoke: &MockAuthInvoke {
                        contract: &id,
                        fn_name: "set_owner",
                        args: (&namehash, &attacker).into_val(&e),
                        sub_invokes: &[],
                    },
                }])
                .set_owner(&namehash, &attacker);
        }));

        assert!(attempted_takeover.is_err());
        assert_eq!(client.owner(&namehash), owner);
    }

    #[test]
    fn transfer_updates_owner() {
        let e = Env::default();
        e.mock_all_auths();
        let id = e.register(Registry, ());
        let client = RegistryClient::new(&e, &id);

        let namehash = BytesN::from_array(&e, &[3u8; 32]);
        let owner = Address::generate(&e);
        let recipient = Address::generate(&e);

        client.set_owner(&namehash, &owner);
        client.transfer(&namehash, &recipient);

        assert_eq!(client.owner(&namehash), recipient);
    }
}
